import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kludxnakkjowxykpgmnf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsdWR4bmFra2pvd3h5a3BnbW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NjIxODYsImV4cCI6MjA4ODMzODE4Nn0.NL8KHjvC6rxm1YfKtP208D-O69MvnT5ooRR__x-hLmo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
