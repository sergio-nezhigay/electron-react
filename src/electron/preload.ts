import { contextBridge, ipcRenderer } from 'electron';

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
    };
  }
}
