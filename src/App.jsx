import React, { useState, useMemo, useEffect } from 'react';
import './App.css';
import mappings from './data/mappings.json';
import { fixWithAI, prepareHybridAiInput } from './aiService';

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
  const [aiModelSelection, setAiModelSelection] = useState('gemini-3-flash-preview');
  const [aiErrorDetails, setAiErrorDetails] = useState('');
  const [showAiErrorDetails, setShowAiErrorDetails] = useState(false);
  const [abortController, setAbortController] = useState(null);

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
          id: uniqueId,
          latin: cleanWord,
        };
      }
      return {
        type: 'fallback',
        value: transliterateFallback(cleanWord) + punctuation,
        id: index,
        latin: cleanWord,
      };
    });
  }, [inputText, selections]);

  const getAiInvokeParams = (selection) => {
    if (selection === 'groq') {
      return { provider: 'groq', modelId: undefined };
    }
    return { provider: 'google', modelId: selection };
  };

  const handleAiFix = async () => {
    const controller = new AbortController();
    setAbortController(controller);
    const hybridPrepared = prepareHybridAiInput(translatedWords);
    const { provider, modelId } = getAiInvokeParams(aiModelSelection);
    setAiErrorDetails('');
    setShowAiErrorDetails(false);
    setIsAiLoading(true);
    try {
      const result = await fixWithAI(hybridPrepared, setAiStatus, provider, modelId, controller);
      if (result.ok) {
        setAiErrorDetails('');
        if (result.text) setAiFixedOutput(result.text);
      } else {
        setAiErrorDetails(result.technicalDetails);
      }
    } finally {
      setIsAiLoading(false);
      setAbortController(null);
    }
  };

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
      setIsAiLoading(false);
      setAiStatus('Cancelled');
      setAbortController(null);
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
            setAiErrorDetails('');
            setShowAiErrorDetails(false);
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
              <div className="model-select-wrapper">
                <span className="model-select-label">Model</span>
                <select
                  className="model-select"
                  value={aiModelSelection}
                  onChange={(e) => setAiModelSelection(e.target.value)}
                  disabled={isAiLoading}
                  aria-label="AI model"
                >
                  <option value="gemini-3-flash-preview">
                    Google: Gemini 3 Flash Preview
                  </option>
                  <option value="gemini-3.1-flash-lite-preview">
                    Google: Gemini 3.1 Flash Lite Preview
                  </option>
                  <option value="gemini-2.5-flash-lite">
                    Google: Gemini 2.5 Flash Lite
                  </option>
                  <option value="groq">Groq: Llama 3.3</option>
                </select>
              </div>
            )}
            {inputText && !aiFixedOutput && isAiLoading && (
              <button className="stop-button" onClick={handleStop}>
                ⏹ Stop
              </button>
            )}
            {inputText && !aiFixedOutput && !isAiLoading && (
              <button className="ai-button" onClick={handleAiFix}>
                ✨ AI Fix
              </button>
            )}
            {inputText && (
              <button className="copy-button" onClick={handleCopy}>
                {copyStatus}
              </button>
            )}
          </div>

          {aiErrorDetails && (
            <div className="error-container">
              <p className="error-message">{aiStatus}</p>
              <button
                type="button"
                className="error-toggle-btn"
                onClick={() => setShowAiErrorDetails((v) => !v)}
              >
                {showAiErrorDetails
                  ? 'Hide Technical Details'
                  : 'Show Technical Details'}
              </button>
              {showAiErrorDetails && (
                <pre className="error-details">
                  {aiErrorDetails}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;