'use client';

import React, { createContext, useState, useContext, ReactNode } from 'react';

interface GeneratedAudioInfo {
  file: File | null; // Store the File object directly
  fileName: string;
  fileUrl: string; // Could be a Blob URL
}

interface VideoWorkflowContextType {
  generatedAudio: GeneratedAudioInfo | null;
  setGeneratedAudio: (audioInfo: GeneratedAudioInfo | null) => void;
  clearGeneratedAudio: () => void;
}

const VideoWorkflowContext = createContext<VideoWorkflowContextType | undefined>(undefined);

export const VideoWorkflowProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [generatedAudio, setGeneratedAudioState] = useState<GeneratedAudioInfo | null>(null);

  const setGeneratedAudio = (audioInfo: GeneratedAudioInfo | null) => {
    // If a previous audio URL exists, revoke it to prevent memory leaks
    if (generatedAudio?.fileUrl && generatedAudio.fileUrl.startsWith('blob:')) {
      URL.revokeObjectURL(generatedAudio.fileUrl);
    }
    setGeneratedAudioState(audioInfo);
  };

  const clearGeneratedAudio = () => {
    if (generatedAudio?.fileUrl && generatedAudio.fileUrl.startsWith('blob:')) {
      URL.revokeObjectURL(generatedAudio.fileUrl);
    }
    setGeneratedAudioState(null);
  };

  return (
    <VideoWorkflowContext.Provider value={{ generatedAudio, setGeneratedAudio, clearGeneratedAudio }}>
      {children}
    </VideoWorkflowContext.Provider>
  );
};

export const useVideoWorkflow = (): VideoWorkflowContextType => {
  const context = useContext(VideoWorkflowContext);
  if (context === undefined) {
    throw new Error('useVideoWorkflow must be used within a VideoWorkflowProvider');
  }
  return context;
};
