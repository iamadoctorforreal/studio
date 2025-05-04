'use client';

import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowRight } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { generateArticleOutline } from '@/ai/flows/generate-article-outline';
import type { GenerateArticleOutlineOutput } from '@/ai/flows/generate-article-outline';


const formSchema = z.object({
  title: z.string().min(5, {
    message: "Title must be at least 5 characters.",
  }),
  focusKeyPhrase: z.string().min(3, {
    message: "Focus key phrase must be at least 3 characters.",
  }),
});

type OutlineFormValues = z.infer<typeof formSchema>;

// Define props including the setActiveTab function
interface OutlineGeneratorProps {
    setActiveTab: (tabValue: string) => void;
}

const OutlineGenerator: React.FC<OutlineGeneratorProps> = ({ setActiveTab }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [outlineResult, setOutlineResult] = useState<GenerateArticleOutlineOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<OutlineFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      focusKeyPhrase: "",
    },
  });

  const onSubmit = async (values: OutlineFormValues) => {
    setIsLoading(true);
    setOutlineResult(null);
    try {
      const result = await generateArticleOutline(values);
      setOutlineResult(result);
      toast({
        title: "Outline Generated",
        description: "Successfully generated the article outline.",
      });
    } catch (error) {
      console.error("Error generating outline:", error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: "Could not generate the article outline. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleProceed = () => {
      setActiveTab('section'); // Switch to the section tab
  };

  return (
    <Card>
        <CardHeader>
            <CardTitle>Article Outline Generator</CardTitle>
            <CardDescription>Generate a news article outline based on a title and focus key phrase.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Article Title</FormLabel>
                        <FormControl>
                        <Input placeholder="Enter the article title..." {...field} />
                        </FormControl>
                        <FormDescription>
                        The main title for your news article.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="focusKeyPhrase"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Focus Key Phrase</FormLabel>
                        <FormControl>
                        <Input placeholder="Enter the focus key phrase..." {...field} />
                        </FormControl>
                        <FormDescription>
                        The central theme or keyword for the article.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate Outline
                </Button>
                </form>
            </Form>

            {outlineResult && (
                <div className="mt-6 pt-6 border-t space-y-4">
                <h3 className="text-lg font-semibold mb-2">Generated Outline:</h3>
                <Textarea
                    readOnly
                    value={outlineResult.outline}
                    className="min-h-[200px] bg-secondary text-secondary-foreground"
                    />
                 <Button variant="secondary" onClick={handleProceed}>
                    Proceed to Section Generation
                    <ArrowRight className="ml-2 h-4 w-4" />
                 </Button>
                </div>
            )}
        </CardContent>
    </Card>
  );
};

export default OutlineGenerator;
