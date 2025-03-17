import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  versions: {
    node: (): string => process.versions.node,
    chrome: (): string => process.versions.chrome,
    electron: (): string => process.versions.electron,
  },

  longProcess: async (): Promise<string> => {
    try {
      return await ipcRenderer.invoke('long-process');
    } catch (error) {
      console.error('Failed to execute long process:', error);
      return 'Process failed';
    }
  },

  onProgressUpdate: (
    callback: (
      event: IpcRendererEvent,
      progressData: { task: string; progress: number }
    ) => void
  ) => {
    const subscription = (
      _event: IpcRendererEvent,
      progressData: { task: string; progress: number }
    ) => callback(_event, progressData);
    ipcRenderer.on('progress-update', subscription);

    return () => {
      ipcRenderer.removeListener('progress-update', subscription);
    };
  },
});

declare global {
  interface Window {
    electronAPI: {
      versions: {
        node: () => string;
        chrome: () => string;
        electron: () => string;
      };

      longProcess: () => Promise<string>;
      onProgressUpdate: (
        callback: (
          event: IpcRendererEvent,
          progressData: { task: string; progress: number }
        ) => void
      ) => () => void;
    };
  }
}
