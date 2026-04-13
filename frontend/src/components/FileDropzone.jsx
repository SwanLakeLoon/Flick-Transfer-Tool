import { useCallback, useState, useRef } from 'react';

const ALLOWED_EXTENSIONS = ['.mov', '.mp4', '.avi'];

export default function FileDropzone({ onFilesSelected, disabled }) {
  const [active, setActive] = useState(false);
  const inputRef = useRef(null);

  const validateFiles = useCallback((fileList) => {
    const valid = [];
    const rejected = [];
    for (const f of fileList) {
      const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        valid.push(f);
      } else {
        rejected.push(f.name);
      }
    }
    if (rejected.length > 0) {
      alert(`These files were rejected (not video files):\n${rejected.join('\n')}`);
    }
    return valid;
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setActive(false);
    if (disabled) return;
    const files = validateFiles(Array.from(e.dataTransfer.files));
    if (files.length) onFilesSelected(files);
  }, [onFilesSelected, disabled, validateFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    if (!disabled) setActive(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => setActive(false), []);

  const handleClick = useCallback(() => {
    if (!disabled && inputRef.current) inputRef.current.click();
  }, [disabled]);

  const handleInputChange = useCallback((e) => {
    const files = validateFiles(Array.from(e.target.files));
    if (files.length) onFilesSelected(files);
    e.target.value = '';
  }, [onFilesSelected, validateFiles]);

  return (
    <div
      id="file-dropzone"
      className={`dropzone${active ? ' dropzone--active' : ''}${disabled ? ' dropzone--disabled' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
    >
      <div className="dropzone__icon">📁</div>
      <div className="dropzone__title">
        {active ? 'Drop your videos here!' : 'Drag & drop video files'}
      </div>
      <div className="dropzone__subtitle">
        or click to browse · .MOV, .MP4, .AVI accepted
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".mov,.mp4,.avi"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
    </div>
  );
}
