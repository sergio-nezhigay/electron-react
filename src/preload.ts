import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
  },
  sayHello: async (name: string) => {
    try {
      return await ipcRenderer.invoke('say-hello', name);
    } catch (error) {
      console.error('Failed to invoke say-hello:', error);
      return 'Failed to send message';
    }
  },
});

// Type declarations for TypeScript
declare global {
  interface Window {
    electronAPI: {
      versions: {
        node: () => string;
        chrome: () => string;
        electron: () => string;
      };
      sayHello: (name: string) => Promise<string>;
    };
  }
}
