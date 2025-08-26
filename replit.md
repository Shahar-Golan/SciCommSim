# Science Communication Training Platform

## Overview

This is a voice-based science communication training platform that helps STEM researchers practice explaining complex concepts to non-expert audiences. The system uses AI to simulate conversations with an elderly layperson, providing real-time feedback on communication effectiveness. Users complete two training conversations and receive detailed performance analytics on clarity, engagement, pacing, and question handling.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Comprehensive shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for theming
- **State Management**: Local React state with React Query for server state management
- **Audio Processing**: Web Audio APIs for voice recording and playback with MediaRecorder

### Backend Architecture
- **Framework**: Express.js with TypeScript running on Node.js
- **API Design**: RESTful API endpoints with JSON communication
- **File Upload**: Multer middleware for handling audio file uploads
- **Development Tools**: Hot module replacement with Vite integration for development

### Voice Processing Pipeline
- **Recording**: Browser MediaRecorder API captures WebM audio format
- **Transcription**: OpenAI Whisper API converts speech to text
- **AI Response**: GPT model generates contextual responses as elderly layperson
- **Speech Synthesis**: OpenAI TTS API converts responses back to audio
- **Real-time Flow**: Seamless voice conversation loop with transcript display

### Database Schema
- **ORM**: Drizzle ORM with PostgreSQL as the primary database
- **Core Tables**: 
  - Students: User registration and identification
  - Training Sessions: Complete learning sessions with ratings
  - Conversations: Individual practice conversations with transcripts
  - Feedback: AI-generated performance analysis with scoring
  - AI Prompts: Configurable system prompts for different AI roles

### AI Integration Architecture
- **Multi-Role System**: Separate AI personas (layperson for conversation, evaluator for feedback)
- **Prompt Engineering**: Configurable system prompts stored in database for flexibility
- **Conversation Memory**: Full transcript context maintained throughout sessions
- **Feedback Analysis**: Multi-dimensional scoring across communication skills

### Application Flow
- **Session Management**: Linear progression through welcome, instructions, two conversations, feedback, survey, and completion
- **Admin Interface**: Hidden dashboard (Ctrl+Shift+A) for monitoring sessions and managing AI prompts
- **Error Handling**: Comprehensive error boundaries with user-friendly messaging

## External Dependencies

### AI Services
- **OpenAI API**: GPT models for conversation and feedback generation, Whisper for transcription, TTS for speech synthesis
- **Audio Processing**: Browser native MediaRecorder and Web Audio APIs

### Database
- **Neon PostgreSQL**: Serverless PostgreSQL database with connection pooling
- **Drizzle Kit**: Database migration and schema management tools

### UI Framework
- **Radix UI**: Headless component primitives for accessibility
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Lucide Icons**: Consistent icon library throughout the interface

### Development Tools
- **TypeScript**: Full type safety across frontend and backend
- **Replit Integration**: Custom Vite plugins for Replit development environment
- **ESBuild**: Fast TypeScript compilation for production builds