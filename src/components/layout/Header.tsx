import React from 'react';
import { Newspaper } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="bg-primary text-primary-foreground shadow-md">
      <div className="container mx-auto px-4 py-4 flex items-center gap-2">
         <Newspaper className="h-6 w-6" />
         <h1 className="text-xl font-semibold">News Automator</h1>
      </div>
    </header>
  );
};

export default Header;
