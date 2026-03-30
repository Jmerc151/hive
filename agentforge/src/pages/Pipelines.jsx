import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const EMPTY_STEP = { agent_id: '', prompt: '', depends_on: null };

export default function Pipelines() {
  const [pipelines, setPipelines] = useState([]);
  const [agents, setAgents] = useState([]);
  const [view, setView] = useState('list'); // list | builder
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState([{ ...EMPTY_STEP }]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(null);

  useEffect(() => {
    loadPipelines();
    loadAgents();
  }, []);

  async function loadPipelines() {
    try { setPipelines(await api.pipelines()); } catch {}
  }

  async function loadAgents() {
    try { setAgents(await api.agents()); } catch {}
  }

  function openBuilder(pipeline) {
    if (pipeline) {
      setEditingId(pipeline.id);
      setName(pipeline.name);
      setDescription(pipeline.description || '');
      setSteps(pipeline.steps?.length ? pipeline.steps : [{ ...EMPTY_STEP }]);
    } else {
      setEditingId(null);
      setName('');
      setDescription('');
      setSteps([{ ...EMPTY_STEP }]);
    }
    setView('builder');
  }

  function closeBuilder() {
    setView('list');
    setEditingId(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name, description, steps };
      if (editingId) {
        await api.updatePipeline(editingId, body);
      } else {
        await api.createPipeline(body);
      }
      closeBuilder();
      loadPipelines();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this pipeline?')) return;
    try { await api.deletePipeline(id); loadPipelines(); } catch {}
  }

  async function handleRun(id) {
    setRunning(id);
    try {
      await api.runPipeline(id);
      loadPipelines();
    } catch (err) {
      alert(err.message);
    } finally {
      setRunning(null);
    }
  }

  async function handleToggle(pipeline) {
    try {
      await api.updatePipeline(pipeline.id, { enabled: !pipeline.enabled });
      loadPipelines();
    } catch {}
  }

  // Step management
  function updateStep(idx, field, value) {
    setSteps(s => s.map((step, i) => i === idx ? { ...step, [field]: value } : step));
  }

  function addStep() {
    setSteps(s => [...s, { ...EMPTY_STEP }]);
  }

  function removeStep(idx) {
    setSteps(s => {
      const next = s.filter((_, i) => i !== idx);
      // Fix depends_on references
      return next.map(step => {
        if (step.depends_on === null) return step;
        if (step.depends_on === idx) return { ...step, depends_on: null };
        if (step.depends_on > idx) return { ...step, depends_on: step.depends_on - 1 };
        return step;
      });
    });
  }

  function moveStep(idx, dir) {
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === steps.length - 1)) return;
    setSteps(s => {
      const next = [...s];
      const target = idx + dir;
      [next[idx], next[target]] = [next[target], next[idx]];
      // Fix depends_on references after swap
      return next.map(step => {
        if (step.depends_on === null) return step;
        if (step.depends_on === idx) return { ...step, depends_on: target };
        if (step.depends_on === target) return { ...step, depends_on: idx };
        return step;
      });
    });
  }

  function agentName(id) {
    return agents.find(a => a.id === id)?.name || 'Unknown';
  }

  // List view
  if (view === 'list') {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Pipelines</h2>
          <button onClick={() => openBuilder(null)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            + New Pipeline
          </button>
        </div>

        {pipelines.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-gray-400 text-lg mb-2">No pipelines yet</div>
            <div className="text-gray-400 text-sm mb-4">Chain agents together into multi-step workflows</div>
            <button onClick={() => openBuilder(null)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Create your first pipeline
            </button>
          </div>
        )}

        <div className="space-y-3">
          {pipelines.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold truncate">{p.name}</h3>
                    <span className="text-xs text-gray-400 shrink-0">
                      {(p.steps || []).length} step{(p.steps || []).length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {p.description && (
                    <div className="text-sm text-gray-500 mt-1 truncate">{p.description}</div>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    {p.last_run_at && (
                      <span>Last run: {new Date(p.last_run_at).toLocaleString()}</span>
                    )}
                    {p.schedule && <span>Schedule: {p.schedule}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3 ml-4">
                  {/* Enabled toggle */}
                  <button onClick={() => handleToggle(p)}
                    className={`w-10 h-6 rounded-full relative transition-colors ${p.enabled ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${p.enabled ? 'left-5' : 'left-1'}`} />
                  </button>

                  <button onClick={() => handleRun(p.id)} disabled={running === p.id}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 disabled:opacity-50">
                    {running === p.id ? 'Running...' : 'Run Now'}
                  </button>
                  <button onClick={() => openBuilder(p)}
                    className="text-xs text-indigo-600 hover:underline">Edit</button>
                  <button onClick={() => handleDelete(p.id)}
                    className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
              </div>

              {/* Mini step preview */}
              {(p.steps || []).length > 0 && (
                <div className="flex items-center gap-2 mt-3 overflow-x-auto">
                  {p.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 shrink-0">
                      {i > 0 && (
                        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                      <div className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600">
                        {agentName(step.agent_id)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Builder view
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={closeBuilder} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold">{editingId ? 'Edit Pipeline' : 'New Pipeline'}</h2>
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
        {/* Pipeline info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <input placeholder="Pipeline name" value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium" />
          <textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)}
            rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>

        {/* Steps */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Steps</h3>
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-gray-200 p-4 relative">
                {/* Step header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-medium text-gray-500">Step {idx + 1}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Move up">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Move down">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {steps.length > 1 && (
                      <button type="button" onClick={() => removeStep(idx)}
                        className="p-1 text-red-400 hover:text-red-600" title="Remove step">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Agent selector */}
                <select value={step.agent_id} onChange={e => updateStep(idx, 'agent_id', e.target.value)}
                  required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2 bg-white">
                  <option value="">Select an agent...</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name} — {a.role}</option>
                  ))}
                </select>

                {/* Prompt */}
                <textarea placeholder="Instructions for this step..." value={step.prompt}
                  onChange={e => updateStep(idx, 'prompt', e.target.value)} required rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2" />

                {/* Depends on */}
                {idx > 0 && (
                  <select value={step.depends_on ?? ''} onChange={e => updateStep(idx, 'depends_on', e.target.value === '' ? null : parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">No dependency (runs immediately)</option>
                    {steps.slice(0, idx).map((s, i) => (
                      <option key={i} value={i}>
                        Waits for Step {i + 1}{s.agent_id ? ` (${agentName(s.agent_id)})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                {/* Dependency arrow */}
                {step.depends_on !== null && step.depends_on !== undefined && (
                  <div className="mt-2 text-xs text-indigo-500 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    Depends on Step {step.depends_on + 1}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button type="button" onClick={addStep}
            className="mt-3 w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
            + Add Step
          </button>
        </div>

        {/* Flow preview */}
        {steps.length > 1 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Flow Preview</h3>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-wrap items-center gap-2">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {i > 0 && (
                      <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                    <div className={`px-3 py-2 rounded-lg border text-xs font-medium ${
                      step.agent_id ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-400'
                    }`}>
                      <span className="font-bold mr-1">{i + 1}.</span>
                      {step.agent_id ? agentName(step.agent_id) : 'No agent'}
                      {step.depends_on !== null && step.depends_on !== undefined && (
                        <span className="ml-1 text-indigo-400">(after {step.depends_on + 1})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving...' : editingId ? 'Update Pipeline' : 'Create Pipeline'}
          </button>
          <button type="button" onClick={closeBuilder}
            className="px-5 py-2.5 text-gray-600 rounded-lg text-sm hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
