import React from 'react';
import {createRoot} from 'react-dom/client';
import {ClubStylePicker,ClubCrest} from '../components/ClubStyle';
import '../tailwind.css';
import '../game-theme.css';
if(import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<main className="min-h-screen bg-slate-950 p-4 text-white"><div className="mx-auto max-w-md"><div className="mb-4 flex items-center gap-3"><ClubCrest name="Identity Preview FC"/><h1>Identity Preview FC</h1></div><ClubStylePicker name="Identity Preview FC"/></div></main>);
