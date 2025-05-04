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
import { Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { generateArticleSection } from '@/ai/flows/generate-article-section';
import type { GenerateArticleSectionOutput } from '@/ai/flows/generate-article-section';

const formSchema = z.object({
  title: z.string().min(5, { message: "Title must be at least 5 characters." }),
  outline: z.string().min(10, { message: "Section outline must be at least 10 characters." }),
  keywords: z.string().min(3, { message: "Keywords must be at least 3 characters." }),
});

type SectionFormValues = z.infer<typeof formSchema>;

const SectionGenerator: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [sectionResult, setSectionResult] = useState<GenerateArticleSectionOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<SectionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      outline: "",
      keywords: "",
    },
  });

  const onSubmit = async (values: SectionFormValues) => {
    setIsLoading(true);
    setSectionResult(null);
    try {
      const result = await generateArticleSection(values);
      setSectionResult(result);
      toast({
        title: "Section Generated",
        description: "Successfully generated the article section.",
      });
    } catch (error) {
      console.error("Error generating section:", error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: "Could not generate the article section. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
        <CardHeader>
            <CardTitle>Article Section Generator</CardTitle>
            <CardDescription>Generate article content section by section in a conversational Nigerian style using AI.</CardDescription>
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
                        <Input placeholder="Enter the overall article title..." {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="outline"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Section Outline</FormLabel>
                        <FormControl>
                        <Textarea placeholder="Describe the content and key points for this section..." {...field} className="min-h-[100px]" />
                        </FormControl>
                        <FormDescription>
                            Provide the specific outline or topic for this section.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="keywords"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Keywords</FormLabel>
                        <FormControl>
                        <Input placeholder="Enter SEO keywords (comma-separated)..." {...field} />
                        </FormControl>
                        <FormDescription>
                            Relevant keywords for SEO and focus.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate Section
                </Button>
                </form>
            </Form>

            {sectionResult && (
                <div className="mt-6 pt-6 border-t">
                <h3 className="text-lg font-semibold mb-2">Generated Section Content:</h3>
                 <Textarea
                    readOnly
                    value={sectionResult.sectionContent}
                    className="min-h-[300px] bg-secondary text-secondary-foreground"
                 />
                </div>
            )}
        </CardContent>
    </Card>
  );
};

export default SectionGenerator;
