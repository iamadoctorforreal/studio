const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function testVoiceOverStdin() {
  console.log('Starting voice-over test using STDIN...');
  
  const testText = "Hello world, this is a test of the Edge TTS voice over system using standard input.";
  const baseOutputFile = path.join(process.cwd(), 'test-voice-stdin-output'); // No .mp3 extension
  const finalOutputFile = `${baseOutputFile}.mp3`; // Expected final file

  console.log(`Base output file name will be: ${baseOutputFile}`);
  console.log(`Expected final output file: ${finalOutputFile}`);

  const commandName = 'edge-tts';
  const args = [
    'synthesize',
    '--voice', 
    'en-US-AriaNeural',
    '--output',
    baseOutputFile 
    // No --text argument, text will be piped to stdin
  ];

  console.log(`Spawning command: ${commandName} ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    const ttsProcess = spawn(commandName, args, {
      shell: true, // Use shell to find edge-tts.cmd
      windowsHide: true,
    });

    let stdoutData = '';
    let stderrData = '';

    ttsProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
      console.log('Test STDOUT chunk:', data.toString());
    });

    ttsProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      console.error('Test STDERR chunk:', data.toString());
    });

    ttsProcess.on('error', (spawnError) => {
      console.error('Failed to start test edge-tts process:', spawnError);
      return reject(spawnError);
    });

    ttsProcess.on('close', (code) => {
      console.log('Test edge-tts process exited with code:', code);
      console.log('Total Test STDOUT:', stdoutData);
      console.log('Total Test STDERR:', stderrData);

      if (code !== 0) {
        return reject(new Error(`Test process failed with code ${code}. Stderr: ${stderrData}`));
      }

      if (fs.existsSync(finalOutputFile)) {
        const stats = fs.statSync(finalOutputFile);
        console.log(`Test file created successfully! Path: ${finalOutputFile}, Size: ${stats.size} bytes`);
        resolve();
      } else {
        console.error(`Test file ${finalOutputFile} was NOT created!`);
        reject(new Error(`Test file ${finalOutputFile} was not created.`));
      }
    });

    // Write text to stdin
    if (ttsProcess.stdin) {
      console.log('Writing to stdin for test process...');
      ttsProcess.stdin.write(testText);
      ttsProcess.stdin.end();
      console.log('Finished writing to stdin for test process.');
    } else {
      console.error("Failed to get stdin for test process.");
      reject(new Error("Failed to get stdin for test process."));
    }
  });
}

testVoiceOverStdin()
  .then(() => console.log('testVoiceOverStdin completed successfully.'))
  .catch(error => console.error('testVoiceOverStdin failed:', error));
