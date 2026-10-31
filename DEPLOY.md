# Deployment Guide

This document lists the required environment variable names and deployment instructions for Closer.

## Required Environment Variables

Configure the following environment variable names in your deployment platform (e.g. Vercel Project Settings):

### Client-Safe Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_BASE_URL`

### Server-Only Variables (Never expose to client)
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_MODEL_CHAIN`
- `GROQ_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`

### Optional Server Variables
- `COMPAT_BASE_URL`
- `COMPAT_API_KEY`
- `COMPAT_LABEL`
- `SUPABASE_PROJECT_REF`

## Supabase Dashboard Setup
1. Enable **Anonymous Sign-Ins** in **Authentication > Sign In / Up**.
2. Enable **Email** provider in **Authentication > Providers**.
3. Enable **Google** OAuth in **Authentication > Providers**, adding `${origin}/auth/callback` to Authorized Redirect URIs.
4. Set Redirect URLs in **Authentication > URL Configuration** to include your production domain.
5. Execute `schema.sql` in the Supabase SQL Editor.
