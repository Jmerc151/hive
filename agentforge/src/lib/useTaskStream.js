import { useState, useEffect, useRef, useCallback } from 'react';

export function useTaskStream(taskId) {
  const [steps, setSteps] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (!taskId) return;

    const token = localStorage.getItem('af_token');
    const workspaceId = localStorage.getItem('af_workspace');
    if (!token || !workspaceId) return;

    // EventSource doesn't support custom headers, so pass auth via query params
    const url = `/api/tasks/${taskId}/stream?token=${encodeURIComponent(token)}&workspace_id=${encodeURIComponent(workspaceId)}`;
    const es = new EventSource(url);
    sourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event === 'connected') {
          setStatus('streaming');
          return;
        }

        if (data.event === 'task:start') {
          setStatus('running');
          setSteps(prev => [...prev, data]);
          return;
        }

        if (data.event === 'task:step') {
          setSteps(prev => [...prev, data]);
          return;
        }

        if (data.event === 'task:complete') {
          setStatus('completed');
          setSteps(prev => [...prev, data]);
          es.close();
          setIsConnected(false);
          return;
        }

        if (data.event === 'task:error') {
          setStatus('failed');
          setError(data.content);
          setSteps(prev => [...prev, data]);
          es.close();
          setIsConnected(false);
          return;
        }
      } catch {}
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      // Reconnect after 3 seconds if not terminal
      if (status !== 'completed' && status !== 'failed') {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };
  }, [taskId, status]);

  useEffect(() => {
    if (!taskId) {
      setSteps([]);
      setStatus('idle');
      setError(null);
      setIsConnected(false);
      return;
    }

    setSteps([]);
    setStatus('connecting');
    setError(null);
    connect();

    return () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      setIsConnected(false);
    };
  }, [taskId]);

  return { steps, status, error, isConnected };
}
