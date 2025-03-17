import { createRoot } from 'react-dom/client';
import * as React from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Stack,
  LinearProgress,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

const App: React.FC = () => {
  const [versions, setVersions] = React.useState<string>('');
  const [processStatus, setProcessStatus] = React.useState<string>('');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [currentTask, setCurrentTask] = React.useState<string>('');
  const [progress, setProgress] = React.useState<number>(0);

  React.useEffect(() => {
    const versionsText =
      `Node: ${window.electronAPI.versions.node()}, ` +
      `Chrome: ${window.electronAPI.versions.chrome()}, ` +
      `Electron: ${window.electronAPI.versions.electron()}`;
    setVersions(versionsText);

    const unsubscribe = window.electronAPI.onProgressUpdate(
      (_, progressData) => {
        setCurrentTask(progressData.task);
        setProgress(progressData.progress);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleLongProcess = async () => {
    setIsProcessing(true);
    setProcessStatus('Processing...');
    setProgress(0);
    setCurrentTask('Starting process...');
    const result = await window.electronAPI.longProcess();
    setProcessStatus(result);
    setIsProcessing(false);
  };

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth='sm'>
        <Box sx={{ my: 4 }}>
          <Typography variant='h3' component='h1' gutterBottom>
            Electron + React App
          </Typography>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant='h6' gutterBottom>
              Versions
            </Typography>
            <Typography variant='body1'>{versions}</Typography>
          </Paper>

          <Stack spacing={2}>
            <Paper sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Button
                  variant='contained'
                  onClick={handleLongProcess}
                  disabled={isProcessing}
                  startIcon={
                    isProcessing && (
                      <CircularProgress size={20} color='inherit' />
                    )
                  }
                >
                  {isProcessing ? 'Processing...' : 'Start Long Process'}
                </Button>

                {isProcessing && (
                  <>
                    <Typography variant='body2' color='textSecondary'>
                      {currentTask}
                    </Typography>
                    <LinearProgress variant='determinate' value={progress} />
                    <Typography variant='caption' align='right'>
                      {progress}%
                    </Typography>
                  </>
                )}

                {processStatus && (
                  <Typography variant='body1'>{processStatus}</Typography>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Box>
      </Container>
    </ThemeProvider>
  );
};

export default App;

const root = createRoot(document.body);
root.render(<App />);
