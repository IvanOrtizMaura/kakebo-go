declare global {
  interface Window {
    __ENV__?: {
      SUPABASE_URL?: string;
      SUPABASE_KEY?: string;
    };
  }
}

const getSupabaseUrl = () => {
  const url = (typeof window !== 'undefined' && window.__ENV__?.SUPABASE_URL) || 'https://acwwoahrlqrsmasukxni.supabase.co';
  return url;
};

const getSupabaseKey = () => {
  const key = (typeof window !== 'undefined' && window.__ENV__?.SUPABASE_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjd3dvYWhybHFyc21hc3VreG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzQyMjgsImV4cCI6MjA5MDY1MDIyOH0.pNISYzVQMmXs9MMOkYH40UpxNpm8_VXaRvSLqnYQOjc';
  return key;
};

export const environment = {
  production: true,
  supabaseUrl: getSupabaseUrl(),
  supabaseKey: getSupabaseKey()
};

