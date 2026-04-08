const POSTBACK_TOKENS = [
  '{ref_id}', '{rt_source}', '{rt_medium}', '{rt_campaign}', '{rt_adgroup}',
  '{rt_ad}', '{rt_placement}', '{rt_keyword}', '{rt_campaignid}', '{rt_adgroupid}',
  '{rt_adid}', '{rt_placementid}', '{rt_role_1}', '{rt_role_2}', '{prelanderid}',
  '{prelandername}', '{landerid}', '{landername}', '{offerid}', '{offername}',
  '{offer_payout}', '{cust_payout}', '{status}', '{sub1}', '{sub2}', '{sub3}',
  '{sub4}', '{sub5}', '{sub6}', '{sub7}', '{sub8}', '{sub9}', '{sub10}',
  '{os}', '{osversion}', '{brand}', '{model}', '{country}', '{countryname}',
  '{region}', '{city}', '{isp}', '{browser}', '{connectiontype}', '{useragent}',
  '{ip}', '{referrerdomain}', '{clicktime}', '{campaignname}', '{campaignid}',
  '{trafficsourcename}', '{sourceid}', '{postbackid}', '{type}', '{language}',
  '{timestamp}', '{external_id}', '{networkid}', '{networkname}',
];

function PostbackEntry({ entry, sourceName, onChange, onRemove }) {
  function insertToken(token) {
    const textarea = document.getElementById(`postback-url-${entry._key}`);
    if (!textarea) {
      onChange({ ...entry, url: (entry.url || '') + token });
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newVal = entry.url.slice(0, start) + token + entry.url.slice(end);
    onChange({ ...entry, url: newVal });
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600">
          S2S Postback {sourceName ? `for ${sourceName}` : ''}
        </p>
        <button type="button" onClick={onRemove} className="btn-danger text-xs">
          Remove
        </button>
      </div>

      {/* URL */}
      <div>
        <label className="label">Enter URL (required)</label>
        <input
          id={`postback-url-${entry._key}`}
          type="text"
          value={entry.url || ''}
          onChange={(e) => onChange({ ...entry, url: e.target.value })}
          placeholder="https://example.com/postback?click_id={ref_id}&payout={offer_payout}"
          className="input font-mono text-xs"
        />
      </div>

      {/* Token chips */}
      <div>
        <p className="label mb-2">Insert token</p>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {POSTBACK_TOKENS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => insertToken(t)}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-gray-200 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 font-mono"
            >
              + {t}
            </button>
          ))}
        </div>
      </div>

      {/* Payout sent */}
      <div>
        <p className="label mb-2">Payout sent</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="label">Payout type</label>
            <select
              value={entry.payout_type || 'percentage'}
              onChange={(e) => onChange({ ...entry, payout_type: e.target.value })}
              className="input"
            >
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed</option>
              <option value="offer_payout">Offer payout</option>
            </select>
          </div>
          <div className="w-32">
            <label className="label">Value</label>
            <input
              type="number"
              min={0}
              value={entry.payout_value ?? 100}
              onChange={(e) => onChange({ ...entry, payout_value: Number(e.target.value) })}
              className="input"
            />
          </div>
          <div className="flex-1">
            <label className="label">Postback method</label>
            <select
              value={entry.method || 'GET'}
              onChange={(e) => onChange({ ...entry, method: e.target.value })}
              className="input"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-2">
        {[
          { key: 'no_updated_conversions', label: "Don't send updated conversions" },
          { key: 'conditional', label: 'Conditional postback' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={entry[key] ?? false}
                onChange={(e) => onChange({ ...entry, [key]: e.target.checked })}
                className="sr-only"
              />
              <div className={`w-9 h-5 rounded-full transition-colors ${entry[key] ? 'bg-blue-600' : 'bg-gray-300'}`} />
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${entry[key] ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-xs text-gray-600">{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

let _key = 0;
function newEntry() {
  return { _key: ++_key, url: '', payout_type: 'percentage', payout_value: 100, method: 'GET', no_updated_conversions: false, conditional: false };
}

export default function PostbackConfig({ postbacks, onChange, sourceName }) {
  function add() {
    onChange([...postbacks, newEntry()]);
  }

  function update(i, val) {
    const next = [...postbacks];
    next[i] = val;
    onChange(next);
  }

  function remove(i) {
    onChange(postbacks.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      {postbacks.map((p, i) => (
        <PostbackEntry
          key={p._key}
          entry={p}
          sourceName={sourceName}
          onChange={(val) => update(i, val)}
          onRemove={() => remove(i)}
        />
      ))}
      <button type="button" onClick={add} className="btn-secondary w-full justify-center">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Postback
      </button>
    </div>
  );
}

export { newEntry };
