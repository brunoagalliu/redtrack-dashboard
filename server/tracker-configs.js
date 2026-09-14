const STATUS_OPTIONS      = ['Available', 'In Use', 'Burned'];
const LIST_STATUS_OPTIONS = ['Available', 'Used', 'Exhausted'];

const DOMAIN_FIELDS = [
  { key: 'url',        label: 'URL',         type: 'text',   required: true },
  { key: 'date_bought',label: 'Date Bought', type: 'date' },
  { key: 'last_used',  label: 'Last Used',   type: 'date' },
  { key: 'status',     label: 'Status',      type: 'select', options: STATUS_OPTIONS },
  { key: 'notes',      label: 'Notes',       type: 'text' },
];

const SIMPLE_LIST_FIELDS = [
  { key: 'list_name', label: 'List Name', type: 'text', required: true },
  { key: 'last_used', label: 'Last Used', type: 'date' },
  { key: 'status',    label: 'Status',    type: 'select', options: LIST_STATUS_OPTIONS },
  { key: 'notes',     label: 'Notes',     type: 'text' },
];

const TABLES = [
  // ── UPM ─────────────────────────────────────────────────────────────────────
  { key: 'upm_domains_com',      label: '.com Domains',      group: 'UPM',      dbTable: 'dt_upm_domains_com',      primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'upm_domains_info',     label: '.info Domains',     group: 'UPM',      dbTable: 'dt_upm_domains_info',     primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'upm_tracking_domains', label: 'Tracking Domains',  group: 'UPM',      dbTable: 'dt_upm_tracking_domains', primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'upm_landing_pages',    label: 'Landing Pages',     group: 'UPM',      dbTable: 'dt_upm_landing_pages',    primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'upm_lists',            label: 'Lists',             group: 'UPM',      dbTable: 'dt_upm_lists',            primaryField: 'list_name', fields: SIMPLE_LIST_FIELDS },
  {
    key: 'upm_new_domains', label: 'New Domains', group: 'UPM', dbTable: 'dt_upm_new_domains', primaryField: 'domain',
    fields: [
      { key: 'domain',       label: 'Domain',       type: 'text', required: true },
      { key: 'date_bought',  label: 'Date Bought',  type: 'date' },
      { key: 'carrier_used', label: 'Carrier Used', type: 'text' },
      { key: 'date_used',    label: 'Date Used',    type: 'date' },
      { key: 'used_by',      label: 'Used By',      type: 'text' },
      { key: 'status',       label: 'Status',       type: 'select', options: STATUS_OPTIONS },
      { key: 'notes',        label: 'Notes',        type: 'text' },
    ],
  },

  // ── Techstar ─────────────────────────────────────────────────────────────────
  { key: 'techstar_domains_com',      label: '.com Domains',     group: 'Techstar', dbTable: 'dt_techstar_domains_com',      primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'techstar_domains_info',     label: '.info Domains',    group: 'Techstar', dbTable: 'dt_techstar_domains_info',     primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'techstar_tracking_domains', label: 'Tracking Domains', group: 'Techstar', dbTable: 'dt_techstar_tracking_domains', primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'techstar_landing_pages',    label: 'Landing Pages',    group: 'Techstar', dbTable: 'dt_techstar_landing_pages',    primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'techstar_lists',            label: 'Lists',            group: 'Techstar', dbTable: 'dt_techstar_lists',            primaryField: 'list_name', fields: SIMPLE_LIST_FIELDS },

  // ── Todd ─────────────────────────────────────────────────────────────────────
  { key: 'todd_domains_com',      label: '.com Domains',     group: 'Todd',     dbTable: 'dt_todd_domains_com',      primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'todd_domains_info',     label: '.info Domains',    group: 'Todd',     dbTable: 'dt_todd_domains_info',     primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'todd_tracking_domains', label: 'Tracking Domains', group: 'Todd',     dbTable: 'dt_todd_tracking_domains', primaryField: 'url',       fields: DOMAIN_FIELDS },
  { key: 'todd_landing_pages',    label: 'Landing Pages',    group: 'Todd',     dbTable: 'dt_todd_landing_pages',    primaryField: 'url',       fields: DOMAIN_FIELDS },

  // ── Lists ────────────────────────────────────────────────────────────────────
  {
    key: 'ranhog_lists', label: 'Ranhog Lists', group: 'Lists', dbTable: 'dt_ranhog_lists', primaryField: 'list_name',
    fields: [
      { key: 'list_name',                  label: 'List Name',           type: 'text',    required: true },
      { key: 'file_sent',                  label: 'File Sent',           type: 'text' },
      { key: 'ios_scraped',                label: 'iOS Scraped',         type: 'boolean' },
      { key: 'ios_uploaded',               label: 'iOS Uploaded',        type: 'boolean' },
      { key: 'last_used',                  label: 'Last Used',           type: 'date' },
      { key: 'requested_30k',              label: 'Requested 30K',       type: 'boolean' },
      { key: 'full_files_sent_requested',  label: 'Full Files Sent/Req', type: 'text' },
      { key: 'status',                     label: 'Status',              type: 'select', options: LIST_STATUS_OPTIONS },
      { key: 'notes',                      label: 'Notes',               type: 'text' },
    ],
  },
  {
    key: 'md_partner_lists', label: 'MD Partner Lists', group: 'Lists', dbTable: 'dt_md_partner_lists', primaryField: 'list_name',
    fields: [
      { key: 'list_name',                  label: 'List Name',           type: 'text',    required: true },
      { key: 'file_sent',                  label: 'File Sent',           type: 'text' },
      { key: 'ios_scraped',                label: 'iOS Scraped',         type: 'boolean' },
      { key: 'ios_uploaded',               label: 'iOS Uploaded',        type: 'boolean' },
      { key: 'last_used',                  label: 'Last Used',           type: 'date' },
      { key: 'requested_30k',              label: 'Requested 30K',       type: 'boolean' },
      { key: 'full_files_sent_requested',  label: 'Full Files Sent/Req', type: 'text' },
      { key: 'status',                     label: 'Status',              type: 'select', options: LIST_STATUS_OPTIONS },
      { key: 'notes',                      label: 'Notes',               type: 'text' },
    ],
  },
  {
    key: 'master_lists', label: 'Master Lists', group: 'Lists', dbTable: 'dt_master_lists', primaryField: 'list_name',
    fields: [
      { key: 'category',  label: 'Category', type: 'text' },
      { key: 'list_name', label: 'List Name', type: 'text', required: true },
      { key: 'uploaded',  label: 'Uploaded',  type: 'boolean' },
      { key: 'provider',  label: 'Provider',  type: 'text' },
      { key: 'status',    label: 'Status',    type: 'select', options: LIST_STATUS_OPTIONS },
      { key: 'notes',     label: 'Notes',     type: 'text' },
    ],
  },
  {
    key: 'scraped_ios_lists', label: 'Scraped iOS Lists', group: 'Lists', dbTable: 'dt_scraped_ios_lists', primaryField: 'list_name',
    fields: [
      { key: 'list_name',          label: 'List Name',           type: 'text',    required: true },
      { key: 'encrypted_file_name',label: 'Encrypted File Name', type: 'text' },
      { key: 'ios_scraped',        label: 'iOS Scraped',         type: 'boolean' },
      { key: 'ios_uploaded',       label: 'iOS Uploaded',        type: 'boolean' },
      { key: 'last_used',          label: 'Last Used',           type: 'date' },
      { key: 'status',             label: 'Status',              type: 'select', options: LIST_STATUS_OPTIONS },
      { key: 'notes',              label: 'Notes',               type: 'text' },
    ],
  },

  // ── Phone Numbers ────────────────────────────────────────────────────────────
  {
    key: 'phone_numbers', label: 'Phone Numbers', group: 'Phone Numbers', dbTable: 'dt_phone_numbers', primaryField: 'number',
    fields: [
      { key: 'vertical_name',  label: 'Vertical',     type: 'text' },
      { key: 'provider_name',  label: 'Provider',     type: 'text' },
      { key: 'domain_name',    label: 'Domain',       type: 'text' },
      { key: 'number',         label: 'Number',       type: 'text', required: true },
      { key: 'number_type',    label: 'Type',         type: 'text' },
      { key: 'number_status',  label: 'Status',       type: 'text' },
      { key: 'notes',          label: 'Notes',        type: 'text' },
    ],
  },
];

const TABLE_MAP = Object.fromEntries(TABLES.map(t => [t.key, t]));

module.exports = { TABLES, TABLE_MAP };
