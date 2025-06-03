'use client';

import SectionGenerator from '@/components/features/SectionGenerator';
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const SectionGeneratorPage: React.FC = () => {
  const [articleTitle, setArticleTitle] = useState('');
  const [articleOutline, setArticleOutline] = useState('');
  const [focusKeyPhrase, setFocusKeyPhrase] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);

  const handleProceedToVoiceOver = (fullArticleText: string) => {
    // Handle the voice over generation - this would typically navigate to the voice over page
    // or trigger voice over generation directly
    console.log('Voice over requested with text:', fullArticleText);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowGenerator(true);
  };

  return (
    <div className="container mx-auto p-4 space-y-4">
      {!showGenerator ? (
        <Card>
          <CardHeader>
            <CardTitle>Article Details</CardTitle>
            <CardDescription>Enter the details for your article generation</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">Article Title</label>
                <Input
                  id="title"
                  value={articleTitle}
                  onChange={(e) => setArticleTitle(e.target.value)}
                  placeholder="Enter article title"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="keyPhrase" className="text-sm font-medium">Focus Key Phrase</label>
                <Input
                  id="keyPhrase"
                  value={focusKeyPhrase}
                  onChange={(e) => setFocusKeyPhrase(e.target.value)}
                  placeholder="Enter focus key phrase"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="outline" className="text-sm font-medium">Article Outline</label>
                <Textarea
                  id="outline"
                  value={articleOutline}
                  onChange={(e) => setArticleOutline(e.target.value)}
                  placeholder="Enter article outline (one point per line)"
                  required
                  rows={5}
                />
              </div>

              <Button type="submit">Generate Article</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <SectionGenerator
          articleTitle={articleTitle}
          articleOutline={articleOutline}
          focusKeyPhrase={focusKeyPhrase}
          onProceedToVoiceOver={handleProceedToVoiceOver}
        />
      )}
    </div>
  );
};

export default SectionGeneratorPage;