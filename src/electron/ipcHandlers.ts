import { ipcMain } from 'electron';
import { EventEmitter } from 'events';

export const registerIpcHandlers = (): void => {
  ipcMain.handle('say-hello', async (event, name) => {
    return `Hello, ${name}!`;
  });

  ipcMain.handle('long-process', async (event) => {
    const progressEmitter = new EventEmitter();
    let progress = 0;

    const interval = setInterval(() => {
      progress += 20;
      progressEmitter.emit('progress', progress);
      if (progress >= 100) {
        clearInterval(interval);
        progressEmitter.emit(
          'completed',
          'Process completed successfully after 5 seconds!'
        );
      }
    }, 1000);

    return new Promise((resolve) => {
      progressEmitter.on('completed', (message) => {
        resolve(message);
      });
      progressEmitter.on('progress', (progress) => {
        event.sender.send('long-process-progress', progress);
      });
    });
  });
};
