import React, { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'Hi! I am your CoinAI assistant. Tell me what you spent or received today (e.g., "Makan siang 50000" or "Gaji bulan ini 5000000").'
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/parse-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText })
      });
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Oops, I could not process that.' }]);
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        throw new Error("You must be logged in to record transactions.");
      }

      await addDoc(collection(db, `users/${user.uid}/transactions`), {
        userId: user.uid,
        type: data.type,
        amount: Number(data.amount),
        category: data.category,
        description: data.description || userText,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/transactions`));

      const typeIndo = data.type === 'expense' ? 'Pengeluaran' : 'Pemasukan';
      const formattedAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(data.amount);
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Tersimpan! ${typeIndo}: ${formattedAmount} untuk kategori ${data.category}.` 
      }]);

    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, there was an error saving your transaction." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden flex-1">
      <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
        <h3 className="font-bold text-white">AI Smart Logging</h3>
      </div>
      
      <div className="flex-1 p-5 overflow-y-auto space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-br-none shadow-lg shadow-indigo-600/20' 
                : 'bg-white/10 border border-white/10 text-slate-200 rounded-bl-none shadow-sm'
            }`}>
              <p className="text-sm">{msg.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center space-x-2">
               <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
               <span className="text-xs text-slate-400">Typing...</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-white/5 border-t border-white/10 flex items-center gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Makan siang 50k..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 focus:bg-white/10 focus:border-indigo-500 outline-none text-sm text-white placeholder-slate-500 transition-all"
        />
        <button 
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-2.5 rounded-xl bg-indigo-600 shadow-lg shadow-indigo-600/20 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-[#020617]"
        >
          <Send className="w-5 h-5 ml-0.5" />
        </button>
      </form>
    </div>
  );
}
