# Slop-Board

**A cinematic storyboard and video pre-production tool**

Created by **Ron Revog**

---

## Overview

Slop-Board is a professional-grade storyboard application designed for filmmakers, directors, and creative teams. It streamlines the pre-production workflow by combining script breakdown, character/location management, storyboard visualization, and video generation into a single cohesive tool.

## Features

### 📝 Script Analysis
- Import and analyze scripts to automatically extract characters, locations, and shot breakdowns
- Support for screenplay and prose formats
- Intelligent shot suggestions based on script content

### 🎬 Storyboard Creation
- Create and organize shots by scenes
- Define shot types (Wide, Medium, Close Up, etc.)
- Specify camera movements (Static, Dolly, Pan, Tracking, etc.)
- Add dialogue and action notes to each shot
- Reference previous shots for visual consistency

### 👥 Character & Location Management
- Create detailed character profiles with reference images
- Build a location library with visual scouts
- Link characters and locations to specific shots

### 🎨 Cinematic Settings
- Choose from legendary cinematographers as style references
- Select film stocks for specific color grades
- Pick from classic anamorphic lenses with authentic characteristics
- Set lighting styles and moods

### 🎥 Video Generation
- Generate video clips from storyboard frames
- Extend videos to create longer sequences
- Video stringout timeline for managing multiple takes and extensions
- Capture frames from generated videos back to storyboards

### 💾 Project Management
- Multiple project support
- Scene-based organization
- Auto-save functionality
- Download storyboard images and video files

## Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ronrevog/Slop-Board.git
   cd Slop-Board
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file and add your API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`

## Tech Stack

- **React** - UI Framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Lucide Icons** - Icon library

## License

MIT License - Feel free to use and modify for your projects.

---

*Built with ❤️ for filmmakers*
