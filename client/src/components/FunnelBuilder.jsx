import { useOffers, useLandings } from '../hooks/useDropdowns';
import SearchableSelect from './SearchableSelect';

const FLOW_TYPES = [
  { value: 'offer', label: 'Offer' },
  { value: 'landing_offer', label: 'Landing > Offer' },
  { value: 'prelanding_landing_offer', label: 'Pre-Landing > Landing > Offer' },
  { value: 'template', label: 'Template' },
];

function OfferRow({ offer, index, onChange, onRemove }) {
  const { data: offers = [], isLoading } = useOffers();

  return (
    <div className="flex items-center gap-2 py-2">
      <span className="text-xs text-gray-400 w-4">{index + 1}</span>
      <div className="flex-1">
        <SearchableSelect
          options={offers.map((o) => ({ value: o.id, label: o.name || o.title }))}
          value={offer.offer_id || ''}
          onChange={(v) => onChange({ ...offer, offer_id: v })}
          placeholder="Select offer…"
          disabled={isLoading}
        />
      </div>
      <div className="w-28">
        <input
          type="number"
          min={1}
          max={100}
          value={offer.weight ?? 100}
          onChange={(e) => onChange({ ...offer, weight: Number(e.target.value) })}
          className="input text-center"
          placeholder="Weight"
        />
      </div>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function LandingRow({ landing, onChange, onRemove, label }) {
  const { data: landings = [], isLoading } = useLandings();

  return (
    <div className="flex items-center gap-2 py-2">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <div className="flex-1">
        <SearchableSelect
          options={landings.map((l) => ({ value: l.id, label: l.name || l.title }))}
          value={landing.landing_id || ''}
          onChange={(v) => onChange({ ...landing, landing_id: v })}
          placeholder="Select landing…"
          disabled={isLoading}
        />
      </div>
      <div className="w-28">
        <input
          type="number"
          min={1}
          max={100}
          value={landing.weight ?? 100}
          onChange={(e) => onChange({ ...landing, weight: Number(e.target.value) })}
          className="input text-center"
          placeholder="Weight"
        />
      </div>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function FunnelCard({ funnel, index, onChange, onRemove }) {
  function updateFlow(flow) {
    onChange({ ...funnel, flow, offers: [], landings: [], pre_landings: [] });
  }

  function addOffer() {
    onChange({ ...funnel, offers: [...(funnel.offers || []), { offer_id: '', weight: 100 }] });
  }

  function updateOffer(i, val) {
    const offers = [...funnel.offers];
    offers[i] = val;
    onChange({ ...funnel, offers });
  }

  function removeOffer(i) {
    onChange({ ...funnel, offers: funnel.offers.filter((_, idx) => idx !== i) });
  }

  function addLanding(type = 'landings') {
    onChange({ ...funnel, [type]: [...(funnel[type] || []), { landing_id: '', weight: 100 }] });
  }

  function updateLanding(type, i, val) {
    const items = [...(funnel[type] || [])];
    items[i] = val;
    onChange({ ...funnel, [type]: items });
  }

  function removeLanding(type, i) {
    onChange({ ...funnel, [type]: funnel[type].filter((_, idx) => idx !== i) });
  }

  const showLandings = funnel.flow === 'landing_offer' || funnel.flow === 'prelanding_landing_offer';
  const showPreLandings = funnel.flow === 'prelanding_landing_offer';

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Funnel header */}
      <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
        <span className="text-sm font-medium text-gray-700">Funnel #{index + 1}</span>
        <input
          type="text"
          value={funnel.label || ''}
          onChange={(e) => onChange({ ...funnel, label: e.target.value })}
          placeholder="Funnel label"
          className="input w-40 text-sm"
        />
        <div className="flex items-center gap-1 ml-auto">
          <label className="label mb-0 mr-1">Weight</label>
          <input
            type="number"
            min={1}
            max={100}
            value={funnel.weight ?? 100}
            onChange={(e) => onChange({ ...funnel, weight: Number(e.target.value) })}
            className="input w-20 text-center"
          />
          <button type="button" onClick={onRemove} className="ml-2 text-gray-400 hover:text-red-500 p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Flow type tabs */}
        <div className="flex gap-1 border-b border-gray-200 pb-3">
          {FLOW_TYPES.map((ft) => (
            <button
              key={ft.value}
              type="button"
              onClick={() => updateFlow(ft.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                funnel.flow === ft.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {ft.label}
            </button>
          ))}
        </div>

        {/* Pre-landings */}
        {showPreLandings && (
          <div>
            <p className="section-title">Pre-Landings</p>
            <div className="divide-y divide-gray-100">
              {(funnel.pre_landings || []).map((l, i) => (
                <LandingRow
                  key={i}
                  landing={l}
                  label="Pre-landing"
                  onChange={(val) => updateLanding('pre_landings', i, val)}
                  onRemove={() => removeLanding('pre_landings', i)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => addLanding('pre_landings')}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Pre-Landing
            </button>
          </div>
        )}

        {/* Landings */}
        {showLandings && (
          <div>
            <p className="section-title">Landings</p>
            <div className="divide-y divide-gray-100">
              {(funnel.landings || []).map((l, i) => (
                <LandingRow
                  key={i}
                  landing={l}
                  label="Landing"
                  onChange={(val) => updateLanding('landings', i, val)}
                  onRemove={() => removeLanding('landings', i)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => addLanding('landings')}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Landing
            </button>
          </div>
        )}

        {/* Offers */}
        <div>
          <p className="section-title">Offers</p>
          <div className="divide-y divide-gray-100">
            {(funnel.offers || []).map((o, i) => (
              <OfferRow
                key={i}
                offer={o}
                index={i}
                onChange={(val) => updateOffer(i, val)}
                onRemove={() => removeOffer(i)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addOffer}
            className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Offer
          </button>
        </div>

        {/* Smart traffic distribution */}
        <label className="flex items-center gap-2 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={funnel.smart_traffic ?? false}
              onChange={(e) => onChange({ ...funnel, smart_traffic: e.target.checked })}
              className="sr-only"
            />
            <div className={`w-9 h-5 rounded-full transition-colors ${funnel.smart_traffic ? 'bg-blue-600' : 'bg-gray-300'}`} />
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${funnel.smart_traffic ? 'translate-x-4' : ''}`} />
          </div>
          <span className="text-xs text-gray-600">Smart traffic distribution</span>
        </label>
      </div>
    </div>
  );
}

export default function FunnelBuilder({ funnels, onChange }) {
  function addFunnel() {
    onChange([
      ...funnels,
      { label: '', weight: 100, flow: 'offer', offers: [{ offer_id: '', weight: 100 }], landings: [], pre_landings: [], smart_traffic: false },
    ]);
  }

  function updateFunnel(i, val) {
    const updated = [...funnels];
    updated[i] = val;
    onChange(updated);
  }

  function removeFunnel(i) {
    onChange(funnels.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      {funnels.map((f, i) => (
        <FunnelCard
          key={i}
          funnel={f}
          index={i}
          onChange={(val) => updateFunnel(i, val)}
          onRemove={() => removeFunnel(i)}
        />
      ))}
      <button
        type="button"
        onClick={addFunnel}
        className="btn-secondary w-full justify-center"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Funnel
      </button>
    </div>
  );
}
