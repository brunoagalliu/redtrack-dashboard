import { useEffect, useRef } from 'react';

export function useTrackerSocket(key, onMessage) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url   = `${proto}//${window.location.host}/ws`;
    let ws;
    let dead = false;
    let retryTimeout;

    function connect() {
      ws = new WebSocket(url);

      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'tracker' && msg.key === key) {
            onMessageRef.current(msg);
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!dead) retryTimeout = setTimeout(connect, 3000); // reconnect after 3s
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      dead = true;
      clearTimeout(retryTimeout);
      ws?.close();
    };
  }, [key]);
}
