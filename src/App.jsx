import React, { useState, useMemo, useEffect } from 'react';
import './App.css';
import mappings from './data/mappings.json';
import { fixWithAI } from './aiService';

const letterMap = {
  'ch': 'ч', 'sh': 'ш', 'ts': 'ц', 'ye': 'е', 'yo': 'ё', 'yu': 'ю', 'ya': 'я',
  'ii': 'ий', 'oi': 'ой', 'ui': 'уй', 'wi': 'үй', 'qi': 'өй',
  'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'э', 'z': 'з', 
  'i': 'и', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о', 'q': 'ө', 
  'p': 'п', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'w': 'ү', 'f': 'ф', 
  'h': 'х', 'y': 'я', 'j': 'ж', 'kh': 'х'
};

function transliterateFallback(text) {
  let result = '';
  let i = 0;
  const lowerText = text.toLowerCase();
  while (i < lowerText.length) {
    let char2 = lowerText.substring(i, i + 2);
    if (letterMap[char2]) {
      result += letterMap[char2]; i += 2;
    } else {
      let char1 = lowerText[i];
      result += letterMap[char1] || char1; i++;
    }
  }
  return result;
}

function App() {
  const [inputText, setInputText] = useState('');
  const [activeMenu, setActiveMenu] = useState(null);
  const [selections, setSelections] = useState({});
  const [copyStatus, setCopyStatus] = useState('Copy Text');
  const [aiStatus, setAiStatus] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiFixedOutput, setAiFixedOutput] = useState(null);

  useEffect(() => {
    const handleGlobalClick = () => setActiveMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const translatedWords = useMemo(() => {
    if (!inputText) return [];
    return inputText.split(/(\s+)/).map((part, index) => {
      if (/\s+/.test(part)) return { type: 'space', value: part };
      const cleanWord = part.toLowerCase().replace(/[.,!?;:]/g, '');
      const puncMatch = part.match(/[.,!?;:]+$/);
      const punctuation = puncMatch ? puncMatch[0] : '';
      const options = mappings[cleanWord];

      if (options) {
        const uniqueId = `${index}-${cleanWord}`;
        const selectedValue = selections[uniqueId] || options[0];
        return {
          type: options.length > 1 ? 'multi' : 'exact',
          value: selectedValue + punctuation,
          options: options,
          id: uniqueId
        };
      }
      return {
        type: 'fallback',
        value: transliterateFallback(cleanWord) + punctuation,
        id: index
      };
    });
  }, [inputText, selections]);

  const handleAiFix = async () => {
    const currentCyrillic = translatedWords.map(w => w.value).join('');
    setIsAiLoading(true);
    try {
        const result = await fixWithAI(currentCyrillic, setAiStatus);
        if (result) setAiFixedOutput(result);
    } catch (err) {
        setAiStatus('API Connection Error');
    } finally {
        setIsAiLoading(false);
    }
  };

  const handleCopy = () => {
    const textToCopy = aiFixedOutput || translatedWords.map(w => w.value).join('');
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopyStatus('Copied!');
      setTimeout(() => setCopyStatus('Copy Text'), 2000);
    });
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>Mongolian Reverse Transliterator</h1>
        <div className="legend">
          <span className="dot orange"></span> Multiple Options 
          <span className="dot blue"></span> Letter-by-Letter
          {aiStatus && <span className="ai-status"> ✨ {aiStatus}</span>}
        </div>
      </div>

      <div className="main-content">
        <textarea
          spellCheck="false" 
          placeholder="Type Latin Mongolian..."
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setAiFixedOutput(null);
            setAiStatus('');
          }}
        />

        <div className="output-wrapper">
          <div className="output-container">
            {aiFixedOutput ? (
              <div className="ai-view">
                <div className="ai-banner">AI View <button onClick={() => setAiFixedOutput(null)}>Undo</button></div>
                {aiFixedOutput}
              </div>
            ) : (
              translatedWords.map((word, i) => (
                <span key={i} className="word-wrapper">
                  {word.type === 'multi' ? (
                    <>
                      <span className="multi-match" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === i ? null : i); }}>
                        {word.value}
                      </span>
                      {activeMenu === i && (
                        <ul className="dropdown-menu">
                          {word.options.map(opt => (
                            <li key={opt} className="dropdown-item" onClick={() => setSelections(prev => ({ ...prev, [word.id]: opt }))}>
                              {opt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <span className={word.type === 'fallback' ? 'fallback-match' : ''}>{word.value}</span>
                  )}
                </span>
              ))
            )}
          </div>
          
          <div className="button-group">
            {inputText && !aiFixedOutput && (
              <button className="ai-button" onClick={handleAiFix} disabled={isAiLoading}>
                {isAiLoading ? "Waiting..." : "✨ Test AI"}
              </button>
            )}
            {inputText && (
              <button className="copy-button" onClick={handleCopy}>
                {copyStatus}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;