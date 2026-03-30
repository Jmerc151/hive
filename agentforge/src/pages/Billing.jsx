import { useState, useEffect } from 'react';
import { api } from '../lib/api';

const PLANS = [
  { id: 'free', name: 'Free', price: '$0', credits: '50/mo', agents: '2', features: 'Basic dashboard, 1 pipeline' },
  { id: 'starter', name: 'Starter', price: '$19/mo', credits: '500/mo', agents: '4', features: 'Full dashboard, 3 pipelines, email alerts' },
  { id: 'pro', name: 'Pro', price: '$49/mo', credits: '2,000/mo', agents: 'Unlimited', features: 'All features, BYO API key, skill marketplace' },
  { id: 'team', name: 'Team', price: '$149/mo', credits: '10,000/mo', agents: 'Unlimited', features: '5 seats, shared workspace, API access' },
];

export default function Billing() {
  const [billing, setBilling] = useState(null);
  const [usage, setUsage] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadBilling();
    api.usage().then(setUsage).catch(() => {});

    // Check for success/credits redirect from Stripe
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setToast('Subscription activated! Your credits have been added.');
      window.history.replaceState({}, '', '/billing');
    } else if (params.get('credits') === 'purchased') {
      setToast('Credits purchased successfully!');
      window.history.replaceState({}, '', '/billing');
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  function loadBilling() {
    api.billingStatus().then(setBilling).catch(() => {});
  }

  async function handleUpgrade(plan) {
    try {
      const { url } = await api.checkout(plan);
      if (url) window.location.href = url;
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleManageSubscription() {
    try {
      const { url } = await api.billingPortal();
      if (url) window.location.href = url;
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Billing</h2>

      {/* Success toast */}
      {toast && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm flex items-center justify-between">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-green-600 hover:text-green-800 ml-4">&times;</button>
        </div>
      )}

      {/* Current status */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <div className="text-sm text-gray-500">Current Plan</div>
            <div className="text-xl font-bold capitalize">{billing?.plan || '—'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Credits Remaining</div>
            <div className="text-xl font-bold">{billing?.credits ?? '—'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Used This Month</div>
            <div className="text-xl font-bold">{usage?.month ?? '—'}</div>
          </div>
          {billing?.stripe_customer_id && (
            <div className="ml-auto">
              <button onClick={handleManageSubscription}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
                Manage Subscription
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map(plan => (
          <div key={plan.id} className={`bg-white rounded-xl border p-5 ${billing?.plan === plan.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-200'}`}>
            <div className="font-semibold text-lg">{plan.name}</div>
            <div className="text-2xl font-bold mt-1">{plan.price}</div>
            <div className="text-sm text-gray-500 mt-3 space-y-1">
              <div>{plan.credits} credits</div>
              <div>{plan.agents} agents</div>
              <div>{plan.features}</div>
            </div>
            {billing?.plan === plan.id ? (
              <div className="mt-4 text-center text-sm text-indigo-600 font-medium">Current plan</div>
            ) : plan.id !== 'free' ? (
              <button onClick={() => handleUpgrade(plan.id)}
                className="mt-4 w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                Upgrade
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
