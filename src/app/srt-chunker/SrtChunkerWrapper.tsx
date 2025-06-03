'use client';

import dynamic from 'next/dynamic';
import React from 'react';

const SrtChunker = dynamic(() => import('@/components/features/SrtChunker'), {
  ssr: false, // Allowed here because this is a Client Component
});

const SrtChunkerWrapper: React.FC = () => {
  return <SrtChunker />;
};

export default SrtChunkerWrapper;
