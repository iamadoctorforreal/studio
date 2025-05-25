import React from 'react';
import Link from 'next/link';
import { Newspaper, FileText, Mic, ListTree, Type } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="bg-primary text-primary-foreground shadow-md">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Newspaper className="h-6 w-6" />
          <h1 className="text-xl font-semibold">News Automator</h1>
        </Link>
        <nav>
          <ul className="flex items-center gap-4">
            <li>
              <Link href="/outline-generator" className="hover:text-secondary-foreground flex items-center gap-1">
                <ListTree size={18} />
                Outline
              </Link>
            </li>
            <li>
              <Link href="/section-generator" className="hover:text-secondary-foreground flex items-center gap-1">
                <Type size={18} />
                Section
              </Link>
            </li>
            <li>
              <Link href="/voice-over-generator" className="hover:text-secondary-foreground flex items-center gap-1">
                <Mic size={18} />
                Voice-over
              </Link>
            </li>
            <li>
              <Link href="/srt-chunker" className="hover:text-secondary-foreground flex items-center gap-1">
                <FileText size={18} />
                SRT Chunker
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
