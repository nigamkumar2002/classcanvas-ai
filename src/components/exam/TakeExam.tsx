import React, { useMemo, useState } from 'react';
import { Timer, Flag, ChevronLeft, ChevronRight, Send } from 'lucide-react';
import type { ExamData, QuestionData } from '@/pages/ExamPage';

interface Props {
  exam: ExamData;
  questions: QuestionData[];
  answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  flagged: Set<string>;
  setFlagged: React.Dispatch<React.SetStateAction<Set<string>>>;
  currentIdx: number;
  setCurrentIdx: React.Dispatch<React.SetStateAction<number>>;
  timeLeft: number;
  onSubmit: () => void;
}

const TakeExam: React.FC<Props> = ({
  exam, questions, answers, setAnswers, flagged, setFlagged,
  currentIdx, setCurrentIdx, timeLeft, onSubmit,
}) => {
  const [languageMode, setLanguageMode] = useState<'both' | 'hindi' | 'english'>('both');
  const q = questions[currentIdx];
  const formatTime = (secs: number) => `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
  const opts = ['A', 'B', 'C', 'D'] as const;

  const parseBilingualText = (value: string) => {
    const raw = value?.trim() || '';
    const hindi = /हिंदी:\s*([\s\S]*?)(?:\nEnglish:|$)/i.exec(raw)?.[1]?.trim() || '';
    const english = /English:\s*([\s\S]*)$/i.exec(raw)?.[1]?.trim() || '';
    return { raw, hindi, english };
  };

  const renderLocalizedText = (value: string, mutedEnglish = false) => {
    const { raw, hindi, english } = parseBilingualText(value);

    if (!hindi && !english) return <span>{raw}</span>;
    if (languageMode === 'hindi') return <span>{hindi || raw || english}</span>;
    if (languageMode === 'english') return <span>{english || raw || hindi}</span>;

    return (
      <span className="space-y-1">
        <span className="block">{hindi || raw}</span>
        {english && <span className={mutedEnglish ? 'block text-muted-foreground' : 'block'}>{english}</span>}
      </span>
    );
  };

  const optLabels: Record<string, string> = { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d };

  const toggleFlag = () => {
    setFlagged(prev => {
      const next = new Set(prev);
      next.has(q.id) ? next.delete(q.id) : next.add(q.id);
      return next;
    });
  };

  // Group questions by subject for palette (use order for grouping)
  const answeredCount = Object.keys(answers).length;
  const totalQ = questions.length;
  const isUrgent = timeLeft < 60;

  // Determine question status for palette
  const getStatus = (qId: string) => {
    if (answers[qId] && flagged.has(qId)) return 'answered-flagged';
    if (answers[qId]) return 'answered';
    if (flagged.has(qId)) return 'flagged';
    return 'unanswered';
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-8rem)]">
      {/* Main Question Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between bg-card rounded-2xl border border-border p-4 shadow-card mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-purple flex items-center justify-center">
                <span className="text-white text-xs font-bold">📋</span>
              </div>
              <div>
                <h2 className="font-bold text-sm">{exam.title}</h2>
                <p className="text-xs text-muted-foreground">Q {currentIdx + 1} of {totalQ}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
            {(['both', 'hindi', 'english'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setLanguageMode(mode)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${languageMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {mode === 'both' ? 'Both' : mode === 'hindi' ? 'Hindi' : 'English'}
              </button>
            ))}
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-base ${isUrgent ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-muted text-foreground'}`}>
            <Timer className="w-4 h-4" /> {formatTime(timeLeft)}
          </div>
          <button onClick={onSubmit}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-red text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all">
            <Send className="w-4 h-4" /> Submit
          </button>
        </div>

        {/* Question Card */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-6 flex-1">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">{exam.title}</span>
            {q.marks > 1 && <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">HARD</span>}
          </div>

          {/* Question text */}
          <div className="mb-6">
            <p className="text-base font-medium leading-relaxed">
              <span className="text-primary font-bold mr-1">{currentIdx + 1}.</span>
              {renderLocalizedText(q.question_text, true)}
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {opts.map(opt => (
              <button key={opt} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                  answers[q.id] === opt
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/40 hover:bg-muted/30'
                }`}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  answers[q.id] === opt ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>{opt}</span>
                <span className="text-sm">{renderLocalizedText(optLabels[opt], true)}</span>
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
            <button onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-all disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button onClick={toggleFlag}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                flagged.has(q.id) ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'border border-border hover:bg-muted'
              }`}>
              <Flag className="w-4 h-4" /> {flagged.has(q.id) ? 'Flagged' : 'Flag for Review'}
            </button>
            {currentIdx < totalQ - 1 ? (
              <button onClick={() => setCurrentIdx(currentIdx + 1)}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-blue text-white text-sm font-semibold hover:opacity-90 transition-all">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={onSubmit}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-red text-white text-sm font-semibold hover:opacity-90 transition-all">
                <Send className="w-4 h-4" /> Submit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Question Palette */}
      <div className="w-full lg:w-72 flex-shrink-0">
        <div className="bg-card rounded-2xl border border-border shadow-card p-5 sticky top-4">
          <h3 className="font-semibold text-sm mb-3">Question Palette</h3>
          
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mb-4 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500" /> Answered</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted border border-border" /> Not Visited</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" /> Flagged</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full border-2 border-primary" /> Current</span>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-5 gap-2">
            {questions.map((qItem, i) => {
              const status = getStatus(qItem.id);
              const isCurrent = i === currentIdx;
              return (
                <button key={qItem.id} onClick={() => setCurrentIdx(i)}
                  className={`w-full aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                    isCurrent ? 'ring-2 ring-primary ring-offset-1' : ''
                  } ${
                    status === 'answered' ? 'bg-green-500 text-white' :
                    status === 'flagged' ? 'bg-amber-400 text-white' :
                    status === 'answered-flagged' ? 'bg-green-500 text-white ring-2 ring-amber-400' :
                    'bg-muted/50 text-muted-foreground border border-border'
                  }`}>
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Stats */}
          <div className="mt-4 pt-4 border-t border-border space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Answered</span><span className="font-bold text-green-600">{answeredCount}/{totalQ}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Flagged</span><span className="font-bold text-amber-600">{flagged.size}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Remaining</span><span className="font-bold">{totalQ - answeredCount}</span></div>
          </div>

          <button onClick={onSubmit}
            className="w-full mt-4 py-2.5 rounded-xl bg-gradient-red text-white text-sm font-semibold hover:opacity-90 transition-all">
            Submit Exam ({answeredCount}/{totalQ})
          </button>
        </div>
      </div>
    </div>
  );
};

export default TakeExam;
