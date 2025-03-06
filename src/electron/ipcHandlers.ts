import { ipcMain } from 'electron';

export const registerIpcHandlers = (): void => {
  ipcMain.handle('say-hello', async (event, name) => {
    return `Hello, ${name}!`;
  });

  ipcMain.handle('long-process', async () => {
    // Simulate a long process
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return 'Process completed successfully after 5 seconds!';
  });
};
