/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sword, Shield, Zap, AlertCircle, Loader2, Trophy, 
  Skull, Map as MapIcon, ScrollText, History, 
  LogOut, LogIn, Image as ImageIcon, X, ChevronRight,
  Trash2, Clock, ChevronLeft
} from 'lucide-react';
import { 
  collection, addDoc, query, where, orderBy, 
  onSnapshot, serverTimestamp, deleteDoc, doc,
  Timestamp, limit, getDocs
} from 'firebase/firestore';
import { db } from './firebase';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const HISTORY_LIMIT = 10;

interface BattleResult {
  winner: string;
  reasoning: string;
  attackerLosses: string;
  defenderLosses: string;
  attackerRealism: string;
  defenderRealism: string;
  advancement: string;
  atmosphere: string;
}

interface SavedBattle {
  id: string;
  attackerNation: string;
  attackerAction: string;
  attackerUnits: string;
  defenderNation: string;
  defenderAction: string;
  defenderUnits: string;
  mapUrl?: string;
  result: BattleResult;
  timestamp: Timestamp;
}

type View = 'menu' | 'judge' | 'history' | 'actionJudge' | 'stats';

interface ActionResult {
  verdict: string;
  analysis: string;
  suggestions: string;
}

interface NationStatsData {
  capital: string;
  governmentType: string;
  ruler: string;
  totalPopulation: string;
  currency: string;
  gdp: string;
  annualGrowth: string;
  unemploymentRate: string;
  activePersonnel: string;
  reserves: string;
  paramilitaries: string;
  tanks: string;
  lightMilitaryVehicles: string;
  afv: string;
  selfPropelledArtillery: string;
  heavyArtillery: string;
  mlrs: string;
  navalPersonnel: string;
  submarines: string;
  aircraftCarriers: string;
  helicopterCarriers: string;
  destroyers: string;
  frigates: string;
  battleships: string;
  corvettes: string;
  patrolShips: string;
  mcmv: string;
  carrierAircraft: string;
  carrierHelicopters: string;
  pilots: string;
  combatAircraft: string;
  groundAttackAircraft: string;
  specialMissionAircraft: string;
  tankerAircraft: string;
  transportAircraft: string;
  transportHelicopters: string;
  combatHelicopters: string;
  nuclearWeapons: string;
}

export default function App() {
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [view, setView] = useState<View>('menu');
  
  // Battle Judge State
  const [attackerNation, setAttackerNation] = useState('');
  const [attackerAction, setAttackerAction] = useState('');
  const [attackerUnits, setAttackerUnits] = useState('');
  const [defenderNation, setDefenderNation] = useState('');
  const [defenderAction, setDefenderAction] = useState('');
  const [defenderUnits, setDefenderUnits] = useState('');
  
  // Action Judge State
  const [singleNation, setSingleNation] = useState('');
  const [actionCategory, setActionCategory] = useState('Guerra');
  const [singleAction, setSingleAction] = useState('');
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);

  // Stats State
  const [statsNation, setStatsNation] = useState('');
  const [statsYear, setStatsYear] = useState('');
  const [statsData, setStatsData] = useState<NationStatsData | null>(null);

  const [mapImage, setMapImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedBattle[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // IP and History Listener
  useEffect(() => {
    const fetchIp = async () => {
      try {
        const res = await fetch('/api/me');
        const data = await res.json();
        setClientIp(data.ip);
      } catch (err) {
        console.error("IP fetch error:", err);
        // Fallback to a local ID if IP fetch fails
        let localId = localStorage.getItem('rp_local_id');
        if (!localId) {
          localId = Math.random().toString(36).substring(2, 15);
          localStorage.setItem('rp_local_id', localId);
        }
        setClientIp(localId);
      }
    };
    fetchIp();
  }, []);

  useEffect(() => {
    if (!clientIp) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'battles'),
      where('clientIp', '==', clientIp),
      orderBy('timestamp', 'desc'),
      limit(HISTORY_LIMIT)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const battles = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SavedBattle[];
      setHistory(battles);
    }, (err) => {
      console.error("Firestore Error:", err);
    });

    return () => unsubscribe();
  }, [clientIp]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMapImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const judgeBattle = async () => {
    if (!attackerAction.trim() || !defenderAction.trim() || !attackerNation.trim() || !defenderNation.trim()) {
      setError("Inserisci tutte le informazioni (Nazioni, Azioni e Unità).");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const contents: any[] = [
        {
          text: `Analizza questa battaglia RP:
          
          ATTACCANTE: ${attackerNation}
          Unità: ${attackerUnits || 'Non specificato'}
          Azione: ${attackerAction}
          
          DIFENSORE: ${defenderNation}
          Unità: ${defenderUnits || 'Non specificato'}
          Azione: ${defenderAction}`
        }
      ];

      if (mapImage) {
        contents.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: mapImage.split(',')[1]
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: `Sei un giudice esperto per un server Roleplay (RP) di geopolitica su Discord. 
          Il tuo compito è analizzare una battaglia tra l'Attaccante (${attackerNation}) e il Difensore (${defenderNation}).
          Considera attentamente il numero e il tipo di unità fornite per entrambi i fronti.
          Se viene fornita un'immagine della mappa, usala per capire le linee di attacco, la geografia e le posizioni strategiche.
          Sii realistico, imparziale e considera la qualità tattica delle azioni descritte.
          Fornisci dettagli specifici su perdite e avanzamento territoriale.
          Rispondi in ITALIANO.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              winner: { type: Type.STRING, description: "Il vincitore (Attaccante o Difensore)" },
              reasoning: { type: Type.STRING, description: "Spiegazione tattica della vittoria" },
              attackerLosses: { type: Type.STRING, description: "Perdite dell'attaccante" },
              defenderLosses: { type: Type.STRING, description: "Perdite del difensore" },
              attackerRealism: { type: Type.STRING, description: "Analisi del realismo dell'azione dell'attaccante" },
              defenderRealism: { type: Type.STRING, description: "Analisi del realismo dell'azione del difensore" },
              advancement: { type: Type.STRING, description: "Avanzamento territoriale o esito geografico" },
              atmosphere: { type: Type.STRING, description: "Descrizione drammatica del culmine della battaglia" },
            },
            required: ["winner", "reasoning", "attackerLosses", "defenderLosses", "attackerRealism", "defenderRealism", "advancement", "atmosphere"]
          },
        },
      });

      const data = JSON.parse(response.text || '{}');
      setResult(data);

      // Save to Firebase
      if (clientIp) {
        // Prune old battles if limit reached
        if (history.length >= HISTORY_LIMIT) {
          const oldest = history[history.length - 1];
          await deleteDoc(doc(db, 'battles', oldest.id));
        }

        await addDoc(collection(db, 'battles'), {
          clientIp,
          attackerNation,
          attackerAction,
          attackerUnits,
          defenderNation,
          defenderAction,
          defenderUnits,
          mapUrl: mapImage || null,
          result: data,
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      console.error(err);
      setError("Errore durante il giudizio della battaglia. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  const deleteBattle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'battles', id));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const loadFromHistory = (battle: SavedBattle) => {
    setAttackerNation(battle.attackerNation || '');
    setAttackerAction(battle.attackerAction);
    setAttackerUnits(battle.attackerUnits || '');
    setDefenderNation(battle.defenderNation || '');
    setDefenderAction(battle.defenderAction);
    setDefenderUnits(battle.defenderUnits || '');
    setMapImage(battle.mapUrl || null);
    setResult(battle.result);
    setView('judge');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderMenu = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center gap-6 py-20"
    >
      <div className="text-center mb-12">
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ repeat: Infinity, duration: 4 }}
          className="inline-block p-4 bg-[#f27d26]/10 rounded-full mb-6"
        >
          <Zap size={64} className="text-[#f27d26]" />
        </motion.div>
        <h1 className="text-6xl font-black tracking-tighter mb-4">MILITARY TRIBUNAL</h1>
        <p className="text-gray-500 uppercase tracking-[0.3em] text-sm">Geopolitica RP Discord Utility</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <MenuButton 
          icon={<Sword size={20} />} 
          label="GIUDICE BATTAGLIE" 
          onClick={() => setView('judge')} 
          primary
        />
        <MenuButton 
          icon={<Zap size={20} />} 
          label="GIUDICE AZIONI" 
          onClick={() => setView('actionJudge')} 
          primary
        />
        <MenuButton 
          icon={<MapIcon size={20} />} 
          label="STATISTICHE" 
          onClick={() => setView('stats')} 
          primary
        />
        <MenuButton 
          icon={<History size={20} />} 
          label="GUERRE VECCHIE" 
          onClick={() => setView('history')} 
        />
      </div>
    </motion.div>
  );

  const renderJudge = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <div className="flex justify-between items-center">
        <button 
          onClick={() => setView('menu')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <ChevronLeft size={18} /> Torna al Menu
        </button>
        <div className="text-right">
          <h2 className="text-2xl font-black tracking-tighter">SALA DEL GIUDIZIO</h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Analisi Tattica in Corso</p>
        </div>
      </div>

      {/* Map Upload Section */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center gap-4 ${
          mapImage ? 'border-[#f27d26]/50 bg-[#f27d26]/5' : 'border-white/10 hover:border-white/20 bg-white/5'
        }`}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleImageUpload} 
          accept="image/*" 
          className="hidden" 
        />
        
        {mapImage ? (
          <div className="relative w-full max-w-md aspect-video rounded-lg overflow-hidden border border-white/10">
            <img src={mapImage} className="w-full h-full object-cover" alt="Map" />
            <button 
              onClick={(e) => { e.stopPropagation(); setMapImage(null); }}
              className="absolute top-2 right-2 p-1 bg-black/60 rounded-full hover:bg-red-500 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 bg-white/5 rounded-full text-gray-400 group-hover:text-[#f27d26] transition-colors">
              <ImageIcon size={32} />
            </div>
            <div className="text-center">
              <p className="font-bold">Carica la Mappa Strategica</p>
              <p className="text-sm text-gray-500">Trascina un'immagine o clicca per selezionare</p>
            </div>
          </>
        )}
      </div>

      {/* Main Interface */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Attacker Section */}
        <div className="group relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-[#f27d26] to-red-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
          <div className="relative bg-[#121214] border border-white/10 rounded-2xl p-6 h-full flex flex-col gap-4">
            <div className="flex items-center gap-3 text-[#f27d26]">
              <Sword size={24} />
              <h2 className="text-xl font-bold uppercase tracking-tight">Attaccante</h2>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Nazione</label>
              <input 
                type="text"
                value={attackerNation}
                onChange={(e) => setAttackerNation(e.target.value)}
                placeholder="Es: Italia, USA, Russia..."
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#f27d26]/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Unità e Mezzi</label>
              <input 
                type="text"
                value={attackerUnits}
                onChange={(e) => setAttackerUnits(e.target.value)}
                placeholder="Es: 50k Fanteria, 200 Tank T-90..."
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#f27d26]/50 transition-colors"
              />
            </div>

            <div className="flex-grow flex flex-col space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Azione RP</label>
              <textarea
                value={attackerAction}
                onChange={(e) => setAttackerAction(e.target.value)}
                placeholder="Descrivi l'azione dell'attaccante..."
                className="flex-grow bg-black/40 border border-white/5 rounded-xl p-4 text-sm focus:outline-none focus:border-[#f27d26]/50 transition-colors resize-none min-h-[150px]"
              />
            </div>
          </div>
        </div>

        {/* Defender Section */}
        <div className="group relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
          <div className="relative bg-[#121214] border border-white/10 rounded-2xl p-6 h-full flex flex-col gap-4">
            <div className="flex items-center gap-3 text-blue-400">
              <Shield size={24} />
              <h2 className="text-xl font-bold uppercase tracking-tight">Difensore</h2>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Nazione</label>
              <input 
                type="text"
                value={defenderNation}
                onChange={(e) => setDefenderNation(e.target.value)}
                placeholder="Es: Germania, Cina, UK..."
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Unità e Mezzi</label>
              <input 
                type="text"
                value={defenderUnits}
                onChange={(e) => setDefenderUnits(e.target.value)}
                placeholder="Es: 30k Fanteria, 150 Artiglieria..."
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>

            <div className="flex-grow flex flex-col space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Azione RP</label>
              <textarea
                value={defenderAction}
                onChange={(e) => setDefenderAction(e.target.value)}
                placeholder="Descrivi l'azione del difensore..."
                className="flex-grow bg-black/40 border border-white/5 rounded-xl p-4 text-sm focus:outline-none focus:border-blue-500/50 transition-colors resize-none min-h-[150px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="flex flex-col items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={judgeBattle}
          disabled={loading}
          className="relative px-12 py-4 bg-white text-black font-bold rounded-full overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute inset-0 bg-[#f27d26] translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <span className="relative z-10 flex items-center gap-2 group-hover:text-white transition-colors">
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                ANALISI IN CORSO...
              </>
            ) : (
              <>
                <Zap size={20} />
                EMETTI IL VERDETTO
              </>
            )}
          </span>
        </motion.button>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-red-400 text-sm"
          >
            <AlertCircle size={16} /> {error}
          </motion.div>
        )}
      </div>

      {/* Results Section */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8 pt-12"
          >
            {/* Winner Banner */}
            <div className="relative p-8 rounded-3xl overflow-hidden border border-white/10 bg-[#121214]">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Trophy size={120} />
              </div>
              <div className="relative">
                <h3 className="text-sm font-mono text-[#f27d26] uppercase tracking-[0.3em] mb-2">Vincitore della Battaglia</h3>
                <div className="text-6xl font-black uppercase tracking-tighter mb-6">
                  {result.winner}
                </div>
                <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                  <ScrollText className="shrink-0 text-gray-400" size={20} />
                  <p className="text-gray-300 italic leading-relaxed">
                    "{result.atmosphere}"
                  </p>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 text-red-400 mb-4">
                  <Skull size={20} />
                  <h4 className="font-bold uppercase text-xs tracking-widest">Perdite Attaccante</h4>
                </div>
                <p className="text-gray-400 text-sm">{result.attackerLosses}</p>
              </div>

              <div className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 text-blue-400 mb-4">
                  <Skull size={20} />
                  <h4 className="font-bold uppercase text-xs tracking-widest">Perdite Difensore</h4>
                </div>
                <p className="text-gray-400 text-sm">{result.defenderLosses}</p>
              </div>

              <div className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 text-green-400 mb-4">
                  <MapIcon size={20} />
                  <h4 className="font-bold uppercase text-xs tracking-widest">Avanzamento</h4>
                </div>
                <p className="text-gray-400 text-sm">{result.advancement}</p>
              </div>
            </div>

            {/* Realism Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <h4 className="text-sm font-bold mb-4 flex items-center gap-2 text-[#f27d26]">
                  <Zap size={16} /> Realismo Attaccante
                </h4>
                <p className="text-gray-400 text-sm leading-relaxed">{result.attackerRealism}</p>
              </div>
              <div className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <h4 className="text-sm font-bold mb-4 flex items-center gap-2 text-blue-400">
                  <Zap size={16} /> Realismo Difensore
                </h4>
                <p className="text-gray-400 text-sm leading-relaxed">{result.defenderRealism}</p>
              </div>
            </div>

            {/* Reasoning */}
            <div className="bg-[#121214] border border-white/10 rounded-2xl p-8">
              <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
                <ScrollText size={20} className="text-[#f27d26]" />
                Analisi Tattica del Giudice
              </h4>
              <div className="prose prose-invert max-w-none text-gray-400 leading-relaxed">
                {result.reasoning}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  const renderHistory = () => (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8"
    >
      <div className="flex justify-between items-center">
        <button 
          onClick={() => setView('menu')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <ChevronLeft size={18} /> Torna al Menu
        </button>
        <div className="text-right">
          <h2 className="text-2xl font-black tracking-tighter">GUERRE VECCHIE</h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Archivio Storico Militare</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {history.length === 0 ? (
          <div className="col-span-full text-center py-20 text-gray-600">
            <Clock size={64} className="mx-auto mb-4 opacity-10" />
            <p>Nessuna guerra registrata nel database.</p>
          </div>
        ) : (
          history.map((battle) => (
            <div 
              key={battle.id}
              onClick={() => loadFromHistory(battle)}
              className="group relative bg-[#121214] border border-white/5 rounded-2xl p-6 hover:border-[#f27d26]/30 cursor-pointer transition-all flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1">
                    {battle.timestamp?.toDate().toLocaleDateString()}
                  </span>
                  <h3 className="font-bold text-lg leading-tight">
                    {battle.attackerNation} vs {battle.defenderNation}
                  </h3>
                </div>
                <button 
                  onClick={(e) => deleteBattle(battle.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-red-500 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              
              <div className="flex-grow mb-4">
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase tracking-widest ${
                  battle.result.winner === 'Attaccante' ? 'bg-[#f27d26]/20 text-[#f27d26]' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  Vittoria: {battle.result.winner}
                </span>
                <p className="text-xs text-gray-500 line-clamp-3 mt-4 italic">
                  "{battle.result.atmosphere}"
                </p>
              </div>

              <div className="flex items-center justify-end text-[#f27d26] group-hover:translate-x-1 transition-transform">
                <ChevronRight size={16} />
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );

  const judgeActionRealism = async () => {
    if (!singleNation.trim() || !singleAction.trim()) {
      setError("Inserisci sia la nazione che l'azione.");
      return;
    }

    setLoading(true);
    setError(null);
    setActionResult(null);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          text: `Analizza questa azione RP di tipo ${actionCategory} per la nazione ${singleNation}:
          
          AZIONE: ${singleAction}
          
          Determina se l'azione è REALISTICA o FANTASCIENZA nel contesto di un RP geopolitico serio. 
          Considera logica, tecnologia attuale, economia e capacità militari plausibili in base alla categoria selezionata.`
        }],
        config: {
          systemInstruction: `Sei un giudice esperto di realismo per un server Roleplay (RP) di geopolitica su Discord.
          Il tuo compito è valutare se un'azione è realistica o pura fantascienza/powerplay, tenendo conto della categoria specifica (Guerra, Economia, Politica, ecc.).
          Sii critico, imparziale e basati su fatti storici, geografici e tecnologici reali.
          Rispondi in ITALIANO.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING, description: "VERDETTO: REALISTICA o FANTASCIENZA" },
              analysis: { type: Type.STRING, description: "Analisi dettagliata del perché è o non è realistica" },
              suggestions: { type: Type.STRING, description: "Suggerimenti per rendere l'azione più realistica se necessario" },
            },
            required: ["verdict", "analysis", "suggestions"]
          },
        },
      });

      const data = JSON.parse(response.text || '{}');
      setActionResult(data);

      if (clientIp) {
        await addDoc(collection(db, 'action_judgments'), {
          clientIp,
          nation: singleNation,
          category: actionCategory,
          action: singleAction,
          result: data,
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      console.error(err);
      setError("Errore durante la valutazione dell'azione.");
    } finally {
      setLoading(false);
    }
  };

  const renderActionJudge = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <div className="flex justify-between items-center">
        <button 
          onClick={() => setView('menu')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <ChevronLeft size={18} /> Torna al Menu
        </button>
        <div className="text-right">
          <h2 className="text-2xl font-black tracking-tighter">GIUDICE DELLE AZIONI</h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Verifica Realismo RP</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-8">
        <div className="group relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-[#f27d26] to-red-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
          <div className="relative bg-[#121214] border border-white/10 rounded-2xl p-8 flex flex-col gap-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Nazione</label>
              <input 
                type="text"
                value={singleNation}
                onChange={(e) => setSingleNation(e.target.value)}
                placeholder="Es: Italia, Francia..."
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#f27d26]/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Categoria Azione</label>
              <div className="flex flex-wrap gap-2">
                {['Guerra', 'Economia', 'Politica', 'Sociale', 'Ricerca'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActionCategory(cat)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      actionCategory === cat 
                        ? 'bg-[#f27d26] text-white shadow-[0_0_15px_rgba(242,125,38,0.3)]' 
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Azione da Valutare</label>
              <textarea
                value={singleAction}
                onChange={(e) => setSingleAction(e.target.value)}
                placeholder={`Descrivi l'azione di tipo ${actionCategory} per verificarne il realismo...`}
                className="w-full bg-black/40 border border-white/5 rounded-xl p-4 text-sm focus:outline-none focus:border-[#f27d26]/50 transition-colors resize-none min-h-[200px]"
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={judgeActionRealism}
              disabled={loading}
              className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-[#f27d26] hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Zap size={20} />}
              {loading ? "ANALISI IN CORSO..." : "VERIFICA REALISMO"}
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {actionResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className={`p-6 rounded-2xl border ${
                actionResult.verdict.includes('REALISTICA') ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
              }`}>
                <h3 className="text-xs font-mono uppercase tracking-widest mb-2 opacity-60">Verdetto</h3>
                <div className={`text-4xl font-black uppercase tracking-tighter ${
                  actionResult.verdict.includes('REALISTICA') ? 'text-green-400' : 'text-red-400'
                }`}>
                  {actionResult.verdict}
                </div>
              </div>

              <div className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <h4 className="text-sm font-bold mb-4 flex items-center gap-2 text-[#f27d26]">
                  <ScrollText size={16} /> Analisi del Giudice
                </h4>
                <p className="text-gray-400 text-sm leading-relaxed">{actionResult.analysis}</p>
              </div>

              <div className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <h4 className="text-sm font-bold mb-4 flex items-center gap-2 text-blue-400">
                  <Zap size={16} /> Suggerimenti
                </h4>
                <p className="text-gray-400 text-sm leading-relaxed">{actionResult.suggestions}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  const fetchNationStats = async () => {
    if (!statsNation.trim() || !statsYear.trim()) {
      setError("Inserisci sia la nazione che l'anno.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatsData(null);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          text: `Genera le statistiche dettagliate per la nazione ${statsNation} nell'anno ${statsYear} per un RP geopolitico.
          Segui rigorosamente il modulo richiesto fornendo dati plausibili per ogni campo.`
        }],
        config: {
          systemInstruction: `Sei un esperto di dati geopolitici e storici. 
          Il tuo compito è fornire statistiche militari e civili plausibili per una nazione in un dato anno.
          Se l'anno è nel passato, usa dati storici reali. Se è nel futuro o in un contesto RP, genera dati coerenti e realistici.
          Rispondi in ITALIANO.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              capital: { type: Type.STRING, description: "Capitale" },
              governmentType: { type: Type.STRING, description: "Tipo di governo" },
              ruler: { type: Type.STRING, description: "Governante" },
              totalPopulation: { type: Type.STRING, description: "Popolazione totale" },
              currency: { type: Type.STRING, description: "Valuta" },
              gdp: { type: Type.STRING, description: "GDP in $" },
              annualGrowth: { type: Type.STRING, description: "Crescita economica annuale" },
              unemploymentRate: { type: Type.STRING, description: "Tasso di disoccupazione" },
              activePersonnel: { type: Type.STRING, description: "Personale attivo" },
              reserves: { type: Type.STRING, description: "Riserve" },
              paramilitaries: { type: Type.STRING, description: "Paramilitari" },
              tanks: { type: Type.STRING, description: "Carri armati" },
              lightMilitaryVehicles: { type: Type.STRING, description: "Veicoli militari leggeri" },
              afv: { type: Type.STRING, description: "AFV - Veicoli corazzati" },
              selfPropelledArtillery: { type: Type.STRING, description: "Artiglieria semovente" },
              heavyArtillery: { type: Type.STRING, description: "Artiglieria pesante" },
              mlrs: { type: Type.STRING, description: "MLRS - Artiglieria a razzo" },
              navalPersonnel: { type: Type.STRING, description: "Personale di bordo" },
              submarines: { type: Type.STRING, description: "Sottomarini" },
              aircraftCarriers: { type: Type.STRING, description: "Portaerei" },
              helicopterCarriers: { type: Type.STRING, description: "Portaelicotteri" },
              destroyers: { type: Type.STRING, description: "Cacciatorpedinieri" },
              frigates: { type: Type.STRING, description: "Fregate" },
              battleships: { type: Type.STRING, description: "Corazzate" },
              corvettes: { type: Type.STRING, description: "Corvette" },
              patrolShips: { type: Type.STRING, description: "Navi Pattugliatrici" },
              mcmv: { type: Type.STRING, description: "MCMV - Navi anti-mine" },
              carrierAircraft: { type: Type.STRING, description: "Aerei per portaerei" },
              carrierHelicopters: { type: Type.STRING, description: "Elicotteri per portaelicotteri" },
              pilots: { type: Type.STRING, description: "Piloti" },
              combatAircraft: { type: Type.STRING, description: "Aerei da combattimento" },
              groundAttackAircraft: { type: Type.STRING, description: "Aerei da attacco al suolo" },
              specialMissionAircraft: { type: Type.STRING, description: "Aerei per missioni speciali" },
              tankerAircraft: { type: Type.STRING, description: "Aerei per rifornimenti in volo" },
              transportAircraft: { type: Type.STRING, description: "Aerei da trasporto" },
              transportHelicopters: { type: Type.STRING, description: "Elicotteri da trasporto" },
              combatHelicopters: { type: Type.STRING, description: "Elicotteri da combattimento" },
              nuclearWeapons: { type: Type.STRING, description: "Armamenti nucleari (Sì/No)" },
            },
            required: [
              "capital", "governmentType", "ruler", "totalPopulation", "currency", "gdp", 
              "annualGrowth", "unemploymentRate", "activePersonnel", "reserves", "paramilitaries", 
              "tanks", "lightMilitaryVehicles", "afv", "selfPropelledArtillery", "heavyArtillery", 
              "mlrs", "navalPersonnel", "submarines", "aircraftCarriers", "helicopterCarriers", 
              "destroyers", "frigates", "battleships", "corvettes", "patrolShips", "mcmv", 
              "carrierAircraft", "carrierHelicopters", "pilots", "combatAircraft", 
              "groundAttackAircraft", "specialMissionAircraft", "tankerAircraft", 
              "transportAircraft", "transportHelicopters", "combatHelicopters", "nuclearWeapons"
            ]
          },
        },
      });

      const data = JSON.parse(response.text || '{}');
      setStatsData(data);

      if (clientIp) {
        await addDoc(collection(db, 'nation_stats'), {
          clientIp,
          nation: statsNation,
          year: statsYear,
          stats: data,
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      console.error(err);
      setError("Errore durante il recupero delle statistiche.");
    } finally {
      setLoading(false);
    }
  };

  const renderStats = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <div className="flex justify-between items-center">
        <button 
          onClick={() => setView('menu')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <ChevronLeft size={18} /> Torna al Menu
        </button>
        <div className="text-right">
          <h2 className="text-2xl font-black tracking-tighter">STATISTICHE NAZIONALI</h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Dati e Risorse della Nazione</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-8">
        <div className="group relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
          <div className="relative bg-[#121214] border border-white/10 rounded-2xl p-8 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Nazione</label>
                <input 
                  type="text"
                  value={statsNation}
                  onChange={(e) => setStatsNation(e.target.value)}
                  placeholder="Es: Italia, Giappone..."
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Anno</label>
                <input 
                  type="text"
                  value={statsYear}
                  onChange={(e) => setStatsYear(e.target.value)}
                  placeholder="Es: 1942, 2024..."
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={fetchNationStats}
              disabled={loading}
              className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <ScrollText size={20} />}
              {loading ? "RECUPERO DATI..." : "MOSTRA STATISTICHE"}
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {statsData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              {/* Informazioni Generali */}
              <section className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-bold mb-6 flex items-center gap-2 text-blue-400">
                  <MapIcon size={18} /> INFORMAZIONI GENERALI
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <StatItem label="Anno" value={statsYear} />
                  <StatItem label="Capitale" value={statsData.capital} />
                  <StatItem label="Tipo di Governo" value={statsData.governmentType} />
                  <StatItem label="Governante" value={statsData.ruler} />
                  <StatItem label="Popolazione Totale" value={statsData.totalPopulation} />
                </div>
              </section>

              {/* Economia */}
              <section className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-bold mb-6 flex items-center gap-2 text-green-400">
                  <Trophy size={18} /> ECONOMIA
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatItem label="Valuta" value={statsData.currency} />
                  <StatItem label="GDP" value={`$ ${statsData.gdp}`} />
                  <StatItem label="Crescita Annuale" value={statsData.annualGrowth} />
                  <StatItem label="Disoccupazione" value={statsData.unemploymentRate} />
                </div>
              </section>

              {/* Esercito */}
              <section className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-bold mb-6 flex items-center gap-2 text-red-400">
                  <Sword size={18} /> ESERCITO
                </h3>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatItem label="Personale Attivo" value={statsData.activePersonnel} />
                    <StatItem label="Riserve" value={statsData.reserves} />
                    <StatItem label="Paramilitari" value={statsData.paramilitaries} />
                  </div>
                  <div className="pt-4 border-t border-white/5">
                    <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-4 font-bold">Veicoli da Trasporto</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      <StatMiniCard label="Carri Armati" value={statsData.tanks} />
                      <StatMiniCard label="Veicoli Leggeri" value={statsData.lightMilitaryVehicles} />
                      <StatMiniCard label="AFV" value={statsData.afv} />
                      <StatMiniCard label="Art. Semovente" value={statsData.selfPropelledArtillery} />
                      <StatMiniCard label="Art. Pesante" value={statsData.heavyArtillery} />
                      <StatMiniCard label="MLRS" value={statsData.mlrs} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Marina */}
              <section className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-bold mb-6 flex items-center gap-2 text-cyan-400">
                  <Shield size={18} /> MARINA
                </h3>
                <div className="space-y-6">
                  <StatItem label="Personale di Bordo" value={statsData.navalPersonnel} />
                  <div className="pt-4 border-t border-white/5">
                    <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-4 font-bold">Navi da Guerra</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      <StatMiniCard label="Sottomarini" value={statsData.submarines} />
                      <StatMiniCard label="Portaerei" value={statsData.aircraftCarriers} />
                      <StatMiniCard label="Portaelicotteri" value={statsData.helicopterCarriers} />
                      <StatMiniCard label="Cacciatorpedinieri" value={statsData.destroyers} />
                      <StatMiniCard label="Fregate" value={statsData.frigates} />
                      <StatMiniCard label="Corazzate" value={statsData.battleships} />
                      <StatMiniCard label="Corvette" value={statsData.corvettes} />
                      <StatMiniCard label="Pattugliatrici" value={statsData.patrolShips} />
                      <StatMiniCard label="MCMV" value={statsData.mcmv} />
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StatItem label="Aerei per Portaerei" value={statsData.carrierAircraft} />
                    <StatItem label="Elicotteri per Portaelicotteri" value={statsData.carrierHelicopters} />
                  </div>
                </div>
              </section>

              {/* Aeronautica */}
              <section className="bg-[#121214] border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-bold mb-6 flex items-center gap-2 text-yellow-400">
                  <Zap size={18} /> AERONAUTICA
                </h3>
                <div className="space-y-6">
                  <StatItem label="Piloti" value={statsData.pilots} />
                  <div className="pt-4 border-t border-white/5">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      <StatMiniCard label="Combattimento" value={statsData.combatAircraft} />
                      <StatMiniCard label="Attacco Suolo" value={statsData.groundAttackAircraft} />
                      <StatMiniCard label="Missioni Speciali" value={statsData.specialMissionAircraft} />
                      <StatMiniCard label="Rifornimento" value={statsData.tankerAircraft} />
                      <StatMiniCard label="Trasporto" value={statsData.transportAircraft} />
                      <StatMiniCard label="Elicotteri Trasp." value={statsData.transportHelicopters} />
                      <StatMiniCard label="Elicotteri Comb." value={statsData.combatHelicopters} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Nucleare */}
              <section className="bg-[#121214] border border-white/10 rounded-2xl p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                    <Skull size={20} />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest">Armamenti Nucleari</h3>
                </div>
                <div className={`px-6 py-2 rounded-full font-black text-sm tracking-widest ${
                  statsData.nuclearWeapons.toLowerCase().includes('sì') ? 'bg-red-500 text-white' : 'bg-white/10 text-gray-400'
                }`}>
                  {statsData.nuclearWeapons.toUpperCase()}
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#e0e0e0] font-sans selection:bg-[#f27d26] selection:text-white pb-20">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#f27d26] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#3b82f6] rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {view === 'menu' && renderMenu()}
          {view === 'judge' && renderJudge()}
          {view === 'actionJudge' && renderActionJudge()}
          {view === 'stats' && renderStats()}
          {view === 'history' && renderHistory()}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{label}</span>
      <span className="text-sm font-medium text-gray-200">{value}</span>
    </div>
  );
}

function StatMiniCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-black/20 border border-white/5 rounded-xl p-3 flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-tight text-gray-500 font-bold leading-none">{label}</span>
      <span className="text-xs font-black text-white">{value}</span>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
  return (
    <div className="bg-[#121214] border border-white/10 rounded-2xl p-6 flex flex-col gap-2">
      <div className={`flex items-center gap-2 ${color}`}>
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-xl font-black tracking-tight">{value}</div>
    </div>
  );
}

function MenuButton({ icon, label, onClick, primary, danger, disabled }: { 
  icon: React.ReactNode, 
  label: string, 
  onClick: () => void, 
  primary?: boolean, 
  danger?: boolean,
  disabled?: boolean
}) {
  return (
    <motion.button
      whileHover={!disabled ? { x: 10 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-4 px-6 py-4 rounded-xl border font-bold text-sm tracking-widest transition-all
        ${disabled ? 'opacity-30 cursor-not-allowed border-white/5 bg-white/5 text-gray-600' : 
          primary ? 'bg-white text-black border-white hover:bg-[#f27d26] hover:text-white hover:border-[#f27d26]' : 
          danger ? 'border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white' :
          'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'}
      `}
    >
      {icon}
      {label}
    </motion.button>
  );
}
