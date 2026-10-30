import { useCallback, useEffect, useRef } from 'react';

import type { ParseResult } from '@shared/import';

import type { WorkerRequest, WorkerResponse } from './import.worker';

/** Talks to the import worker one request at a time; the worker lives as long as the screen. */
export function useImportWorker() {
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  const send = useCallback((req: WorkerRequest): Promise<WorkerResponse> => {
    worker.current ??= new Worker(new URL('./import.worker.ts', import.meta.url), {
      type: 'module',
    });
    const w = worker.current;
    return new Promise((resolve) => {
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        resolve(e.data);
      };
      w.onerror = () => {
        resolve({ type: 'error', message: 'Could not read that file.' });
      };
      w.postMessage(req);
    });
  }, []);

  const parse = useCallback(
    async (input: File | string): Promise<ParseResult> => {
      const res = await send(
        typeof input === 'string'
          ? { type: 'parse-text', text: input }
          : { type: 'parse-file', file: input },
      );
      if (res.type === 'error') throw new Error(res.message);
      if (res.type !== 'parsed') throw new Error('Unexpected reply.');
      return res.result;
    },
    [send],
  );

  const downloadTemplate = useCallback(
    async (format: 'csv' | 'xlsx') => {
      const res = await send({ type: 'template', format });
      if (res.type !== 'template') throw new Error('Could not make the template.');
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [send],
  );

  /** Builds the file in the worker and saves it (CSV or .xlsx). */
  const downloadRows = useCallback(
    async (req: Extract<WorkerRequest, { type: 'export' }>) => {
      const res = await send(req);
      if (res.type !== 'template') throw new Error('Could not make the file.');
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [send],
  );

  return { parse, downloadTemplate, downloadRows };
}
