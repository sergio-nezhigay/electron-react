import { createRoot } from 'react-dom/client';
import * as React from 'react';

const App: React.FC = () => {
  const [message, setMessage] = React.useState<string>('');
  const [versions, setVersions] = React.useState<string>('');

  React.useEffect(() => {
    // Display versions info when component mounts
    const versionsText =
      `Node: ${window.electronAPI.versions.node()}, ` +
      `Chrome: ${window.electronAPI.versions.chrome()}, ` +
      `Electron: ${window.electronAPI.versions.electron()}`;
    setVersions(versionsText);
  }, []);

  const handleSayHello = async () => {
    const response = await window.electronAPI.sayHello('Electron');
    setMessage(response);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Electron + React App</h1>

      <div>
        <h2>Versions:</h2>
        <p>{versions}</p>
      </div>

      <div>
        <button onClick={handleSayHello}>Say Hello</button>
        {message && <p>{message}</p>}
      </div>
    </div>
  );
};

export default App;

const root = createRoot(document.body);

root.render(<App />);
