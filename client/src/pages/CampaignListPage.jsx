import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { api } from '../lib/api';
import CopyButton from '../components/CopyButton';

function replaceParams(url, params) {
  if (!url) return url;
  try {
    const [base] = url.split('?');
    return params ? `${base}?${params}` : base;
  } catch {
    return url;
  }
}

function appendParams(url, params) {
  if (!url || !params) return url;
  try {
    const [base, qs] = url.split('?');
    const existing = new URLSearchParams(qs || '');
    existing.delete('sourceid');
    existing.delete('clk');
    const newParams = new URLSearchParams(params);
    newParams.forEach((v, k) => existing.set(k, v));
    const finalQs = existing.toString();
    return finalQs ? `${base}?${finalQs}` : base;
  } catch {
    return url;
  }
}

function buildUrlParams(title, partners, sourceTitle) {
  if (sourceTitle === 'SMS - Internal') {
    return { tracking: null, impression: null };
  }
  if (sourceTitle === 'SMS - UPM') {
    const parts = title ? title.split('_') : [];
    const hasClickers = parts.some((p) => p.toLowerCase() === 'clickers');
    const partnerAliasSet = new Map((partners || []).map((p) => [p.alias, p.code]));
    const matchedCode = parts.map((p) => partnerAliasSet.get(p)).find(Boolean);
    const sourceidParam = matchedCode ? `sourceid=${matchedCode}` : '';
    const clkParam = `clk=${hasClickers ? 1 : 0}`;
    const trackingExtra = [sourceidParam, clkParam].filter(Boolean).join('&');
    return {
      tracking: `phone=PHONE&firstname=FIRST_NAME&templateid=TEMPLATE_ID&${trackingExtra}`,
      impression: 'phone={PHONE}&firstname={FIRST_NAME}&templateid={TEMPLATE_ID}',
    };
  }
  if (sourceTitle === 'SMS - Ranhog') {
    if (!title || !partners?.length) return { tracking: null, impression: null };
    const parts = title.split('_');
    const partnerAliasSet = new Map(partners.map((p) => [p.alias, p.code]));
    const matchedCode = parts.map((p) => partnerAliasSet.get(p)).find(Boolean);
    return { tracking: matchedCode ? `sourceid=${matchedCode}` : null, impression: null, replace: true };
  }
  if (!title || !partners?.length) return { tracking: null, impression: null };
  const parts = title.split('_');
  const hasClickers = parts.some((p) => p.toLowerCase() === 'clickers');
  const partnerAliasSet = new Map(partners.map((p) => [p.alias, p.code]));
  const matchedCode = parts.map((p) => partnerAliasSet.get(p)).find(Boolean);
  const clkParam = `clk=${hasClickers ? 1 : 0}`;
  const tracking = matchedCode ? `sourceid=${matchedCode}&${clkParam}` : clkParam;
  return { tracking, impression: null };
}

function SortIcon({ sorted }) {
  if (!sorted) return <span className="text-gray-300 ml-1 text-[10px]">↕</span>;
  return <span className="text-indigo-500 ml-1 text-[10px]">{sorted === 'asc' ? '▲' : '▼'}</span>;
}

export default function CampaignListPage() {
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState([{ id: 'serial_number', desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['campaigns', { search }],
    queryFn: () => api.getCampaigns({ title: search || undefined }),
  });

  const { data: partners = [] } = useQuery({
    queryKey: ['list', 'partners'],
    queryFn: () => api.getPartners(),
  });

  const allCampaigns = useMemo(
    () => (Array.isArray(data) ? data : (data?.items ?? [])),
    [data]
  );

  const cloneMutation = useMutation({
    mutationFn: (id) => api.cloneCampaign(id),
    onSuccess: (cloned) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      navigate(`/campaigns/${cloned.id}/edit`);
    },
  });

  function handleSearch(value) {
    setSearch(value);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const columns = useMemo(() => [
    {
      id: 'serial_number',
      accessorKey: 'serial_number',
      header: '#',
      size: 56,
      enableSorting: true,
      enableResizing: false,
      meta: { tdClass: 'px-4 py-3 text-sm text-gray-400' },
    },
    {
      id: 'title',
      accessorKey: 'title',
      header: 'Campaign Name',
      size: 360,
      enableSorting: true,
      meta: { tdClass: 'px-4 py-3 text-sm font-medium text-gray-900 max-w-xs' },
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center gap-2">
            <Link to={`/campaigns/${c.id}/edit`} className="hover:text-blue-600 min-w-0 flex-1 line-clamp-2">
              {c.title}
            </Link>
            <button
              type="button"
              onClick={() => cloneMutation.mutate(c.id)}
              disabled={cloneMutation.isPending}
              title="Clone campaign"
              className="shrink-0 px-2 py-1 text-xs rounded border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-medium disabled:opacity-50"
            >
              Clone
            </button>
            <CopyButton text={c.title} />
          </div>
        );
      },
    },
    {
      id: 'tracking_url',
      header: 'Tracking Link',
      size: 300,
      enableSorting: false,
      meta: { tdClass: 'px-4 py-3 text-xs text-gray-500 max-w-sm font-mono' },
      cell: ({ row }) => {
        const c = row.original;
        const { tracking: trackingParams, replace } = buildUrlParams(c.title, partners, c.source_title);
        const applyParams = replace ? replaceParams : appendParams;
        const trackingUrl = applyParams(c.trackback_url, trackingParams);
        return trackingUrl ? (
          <div className="flex items-center gap-2">
            <span className="truncate">{trackingUrl}</span>
            <CopyButton text={trackingUrl} />
          </div>
        ) : '—';
      },
    },
    {
      id: 'impression_url',
      header: 'Impression Link',
      size: 300,
      enableSorting: false,
      meta: { tdClass: 'px-4 py-3 text-xs text-gray-500 max-w-sm font-mono' },
      cell: ({ row }) => {
        const c = row.original;
        const { impression: impressionParams, replace } = buildUrlParams(c.title, partners, c.source_title);
        const applyParams = replace ? replaceParams : appendParams;
        const impressionUrl = applyParams(c.impression_url, impressionParams);
        return impressionUrl ? (
          <div className="flex items-center gap-2">
            <span className="truncate">{impressionUrl}</span>
            <CopyButton text={impressionUrl} />
          </div>
        ) : '—';
      },
    },
    {
      id: 'actions',
      header: '',
      size: 60,
      enableSorting: false,
      enableResizing: false,
      meta: { tdClass: 'px-4 py-3 text-right text-sm' },
      cell: ({ row }) => (
        <Link
          to={`/campaigns/${row.original.id}/edit`}
          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          Edit
        </Link>
      ),
    },
  ], [partners, cloneMutation.isPending, cloneMutation.mutate]);

  const table = useReactTable({
    data: allCampaigns,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    columnResizeMode: 'onChange',
    getRowId: (row) => String(row.id),
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const totalCount = allCampaigns.length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Campaigns</h1>
        <Link to="/campaigns/new" className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Campaign
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="input max-w-xs"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading campaigns...</div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-500">Failed to load campaigns.</div>
        ) : totalCount === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No campaigns found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: 'fixed', width: '100%', minWidth: table.getTotalSize() }}>
              <thead className="bg-gray-50">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="divide-y divide-gray-200">
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        style={{ width: header.getSize(), position: 'relative' }}
                        className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap overflow-hidden
                          ${header.column.getCanSort() ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <SortIcon sorted={header.column.getIsSorted()} />
                        )}
                        {header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                              onClick={(e) => e.stopPropagation()}
                            className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none ${
                              header.column.getIsResizing() ? 'bg-blue-400' : 'bg-transparent hover:bg-gray-300'
                            }`}
                          />
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className={`overflow-hidden ${cell.column.columnDef.meta?.tdClass ?? 'px-4 py-3 text-sm text-gray-900'}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            Showing {pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, totalCount)} of {totalCount} campaigns
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">«</button>
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
            <span className="px-3 py-1 text-xs text-gray-600">Page {pageIndex + 1} of {table.getPageCount()}</span>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">›</button>
            <button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">»</button>
          </div>
        </div>
      )}
      {table.getPageCount() <= 1 && totalCount > 0 && (
        <p className="mt-3 text-xs text-gray-400">Showing all {totalCount} campaigns</p>
      )}
    </div>
  );
}
