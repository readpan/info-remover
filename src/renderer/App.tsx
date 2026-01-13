import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProcessResult, AppConfig, FileDetailedInfo } from '../main/types';

type ElectronAPI = typeof window.electronAPI;

const resolveApi = (): ElectronAPI | undefined =>
  (window as any).electronAPI as ElectronAPI | undefined;

function uniqueMerge(current: string[], incoming: string[]) {
  const set = new Set(current);
  incoming.forEach((f) => set.add(f));
  return Array.from(set);
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (ms: number) => {
  return new Date(ms).toLocaleString();
};

const MetadataView: React.FC<{ info: FileDetailedInfo }> = ({ info }) => {
  const { metadata, category } = info;
  if (!metadata) return <p>暂无元数据信息</p>;

  const items = [];
  
  // 通用信息
  items.push({ label: '文件大小', value: formatSize(info.size) });
  items.push({ label: '修改时间', value: formatDate(info.mtime) });

  // 分类型展示核心信息
  if (category === 'image') {
    if (metadata.width) items.push({ label: '分辨率', value: `${metadata.width} x ${metadata.height}` });
    if (metadata.format) items.push({ label: '编码格式', value: metadata.format.toUpperCase() });
    items.push({ label: '包含 EXIF', value: metadata.hasExif ? '是' : '否' });
  } else if (category === 'office' || category === 'pdf') {
    if (metadata.title) items.push({ label: '标题', value: metadata.title });
    if (metadata.author) items.push({ label: '作者', value: metadata.author });
    if (metadata.creator) items.push({ label: '创建程序', value: metadata.creator });
    if (metadata.lastModifiedBy) items.push({ label: '最后修改人', value: metadata.lastModifiedBy });
    if (metadata.creationDate) items.push({ label: '创建日期', value: metadata.creationDate });
    if (metadata.pageCount) items.push({ label: '总页数', value: metadata.pageCount });
  } else if (category === 'zip') {
    if (metadata.fileCount) items.push({ label: '包含文件数', value: metadata.fileCount });
  } else if (category === 'video') {
    if (metadata.duration) items.push({ label: '时长', value: `${Math.floor(metadata.duration)}s` });
    if (metadata.videoCodec) items.push({ label: '视频编码', value: metadata.videoCodec });
    if (metadata.audioCodec) items.push({ label: '音频编码', value: metadata.audioCodec });
    if (metadata.width) items.push({ label: '分辨率', value: `${metadata.width} x ${metadata.height}` });
    if (metadata.encoder) items.push({ label: '编码软件', value: metadata.encoder });
    if (metadata.title) items.push({ label: '标题', value: metadata.title });
    if (metadata.author) items.push({ label: '艺术家', value: metadata.author });
    if (metadata.creationDate) items.push({ label: '创建时间', value: metadata.creationDate });
  }

  return (
    <div className="metadata-container">
      {items.map((item, idx) => (
        <div className="info-item" key={idx}>
          <span className="info-label">{item.label}</span>
          <span className="info-value">{item.value}</span>
        </div>
      ))}
      
      {/* 详细 EXIF 信息展示 */}
      {category === 'image' && metadata.exifData && Object.keys(metadata.exifData).length > 0 && (
        <div className="exif-details" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #cbd5e1' }}>
          <h5 style={{ margin: '0 0 8px 0', color: '#475569' }}>详细 EXIF 数据</h5>
          <div className="exif-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px' }}>
            {Object.entries(metadata.exifData).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: '#64748b' }}>{key}</span>
                <span style={{ color: '#1e293b', fontWeight: 500 }}>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const api = resolveApi();
  const [files, setFiles] = useState<string[]>([]);
  const [config, setConfig] = useState<AppConfig>({ outputDir: '', copySuffix: '', overwriteSource: false });
  const [showSettings, setShowSettings] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<Record<string, ProcessResult>>({});
  const [logs, setLogs] = useState<string[]>([]);
  
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [originalInfo, setOriginalInfo] = useState<FileDetailedInfo | null>(null);
  const [processedInfo, setProcessedInfo] = useState<FileDetailedInfo | null>(null);

  const log = useCallback((line: string) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} ${line}`]);
  }, []);

  useEffect(() => {
    if (api) {
      api.getConfig().then((loadedConfig) => {
        setConfig({
          outputDir: loadedConfig.outputDir || '',
          copySuffix: loadedConfig.copySuffix || '',
          overwriteSource: loadedConfig.overwriteSource || false,
        });
        if (!loadedConfig.outputDir && !loadedConfig.overwriteSource) setShowSettings(true);
      });
    }
  }, [api]);

  const saveSettings = async (newConfig: AppConfig) => {
    if (api) {
      const success = await api.setConfig(newConfig);
      if (success) {
        setConfig(newConfig);
        setShowSettings(false);
        log('配置已保存');
      }
    }
  };

  const handleClearOutputDir = async () => {
    if (!api || !config.outputDir) return;
    if (window.confirm(`确定要清空输出目录吗？\n${config.outputDir}`)) {
      const success = await api.clearDirectory(config.outputDir);
      if (success) {
        log('输出目录已清空');
        alert('输出目录已清空');
      }
    }
  };

  const addPaths = useCallback(
    async (paths: string[], source: string) => {
      if (!api) return;
      const filtered = paths.filter(Boolean);
      const scanned = await api.scanPaths(filtered);
      const validFiles = scanned.files.filter(Boolean);
      if (validFiles.length > 0) {
        setFiles((prev) => uniqueMerge(prev, validFiles));
        log(`${source}: 新增 ${validFiles.length} 个文件`);
        if (!selectedFilePath) setSelectedFilePath(validFiles[0]);
      }
    },
    [log, api, selectedFilePath],
  );

  useEffect(() => {
    if (!api || !selectedFilePath) {
      setOriginalInfo(null);
      setProcessedInfo(null);
      return;
    }
    const fetchInfos = async () => {
      const orig = await api.getFileInfo(selectedFilePath);
      setOriginalInfo(orig);
      const result = results[selectedFilePath];
      if (result && result.status === 'success' && result.outputPath) {
        const proc = await api.getFileInfo(result.outputPath);
        setProcessedInfo(proc);
      } else {
        setProcessedInfo(null);
      }
    };
    fetchInfos();
  }, [api, selectedFilePath, results]);

  // 全局拖拽处理：仅阻止默认行为，让 preload.ts 的 window 监听器工作
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    // 注意：不要在 window 上阻止 drop 默认行为，否则 preload 里的监听器可能也会受影响
    // 或者确保 preload 监听器先执行。
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // 监听来自 preload 的文件拖入事件
  useEffect(() => {
    if (!api) return;
    const unsubscribe = api.onFileDrop((paths: string[]) => {
      addPaths(paths, '拖拽');
    });
    const unsubscribeNav = api.onNavFileDrop((paths: string[]) => {
      addPaths(paths, '导航栏拖拽');
    });
    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeNav) unsubscribeNav();
    };
  }, [api, addPaths]);

  const handleChooseFiles = useCallback(async () => {
    if (api) {
      const paths = await api.selectFiles();
      if (paths.length > 0) await addPaths(paths, '选择文件');
    }
  }, [addPaths, api]);

  const handleOpenOutputDir = useCallback(async () => {
    if (api && config.outputDir) {
      await api.openDirectory(config.outputDir);
    }
  }, [api, config.outputDir]);

  const selectOutputDir = useCallback(async () => {
    if (api) {
      const path = await api.selectDirectory();
      if (path) {
        setConfig((prev) => ({ ...prev, outputDir: path }));
      }
    }
  }, [api]);

  const handleProcess = useCallback(async () => {
    if (!files.length || (!config.overwriteSource && !config.outputDir) || !api) return;
    setProcessing(true);
    try {
      const processResults = (await api.processFiles(
        files.map((path) => ({ path })),
        { 
          outputDir: config.outputDir, 
          copySuffix: config.copySuffix,
          overwriteSource: config.overwriteSource 
        },
      )) as ProcessResult[];
      const map: Record<string, ProcessResult> = {};
      processResults.forEach((r) => { map[r.inputPath] = r; });
      setResults(prev => ({ ...prev, ...map }));
      log(`处理完成 ${processResults.length} 个文件`);
    } catch (err) {
      log(`处理失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setProcessing(false);
    }
  }, [files, config, log, api]);

  const clear = () => {
    setFiles([]);
    setResults({});
    setLogs([]);
    setSelectedFilePath(null);
  };

  return (
    <div className="app">
      {/* 左侧面板 */}
      <div className="left-panel">
        <div className="header-actions">
          <h3 className="header-title">元数据抹除</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!config.overwriteSource && config.outputDir && (
              <button className="settings-btn" onClick={handleOpenOutputDir} title="打开输出目录">📂 打开输出目录</button>
            )}
            <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️ 设置</button>
          </div>
        </div>
        <div className="drop-zone" onClick={handleChooseFiles} style={{ padding: '20px 10px', marginBottom: '16px' }}>
          拖拽文件到窗口或点击选择
        </div>
        <div className="files" style={{ flex: 1, marginTop: 0 }}>
          <div style={{ paddingBottom: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '8px', fontSize: '14px' }}>
            待处理清单 ({files.length})
          </div>
          {files.map((f) => (
            <div 
              key={f} 
              className={`file-row ${selectedFilePath === f ? 'selected' : ''}`}
              onClick={() => setSelectedFilePath(f)}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                {f.split(/[\\/]/).pop()}
              </span>
              <span className={`status ${results[f]?.status || ''}`}>
                {results[f]?.status === 'success' ? '✅' : results[f]?.status === 'error' ? '❌' : '⏳'}
              </span>
            </div>
          ))}
        </div>
        <div className="actions" style={{ marginTop: '16px' }}>
          <button onClick={handleProcess} disabled={processing || !files.length} style={{ flex: 1 }}>
            {processing ? '处理中...' : '开始执行'}
          </button>
          <button className="secondary" onClick={clear} disabled={processing}>清空</button>
        </div>
      </div>

      {/* 右侧面板 */}
      <div className="right-panel">
        {selectedFilePath ? (
          <>
            <div className="viewer-header">
              <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFilePath.split(/[\\/]/).pop()}
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>{selectedFilePath}</p>
            </div>
            <div className="viewer-content">
              {results[selectedFilePath] && (
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px 16px', 
                  borderRadius: '8px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  backgroundColor: results[selectedFilePath].status === 'success' ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${results[selectedFilePath].status === 'success' ? '#bbf7d0' : '#fee2e2'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>{results[selectedFilePath].status === 'success' ? '✅' : '❌'}</span>
                    <div>
                      <div style={{ fontWeight: 'bold', color: results[selectedFilePath].status === 'success' ? '#166534' : '#991b1b' }}>
                        {results[selectedFilePath].status === 'success' ? '处理成功' : '处理失败'}
                      </div>
                      {results[selectedFilePath].status === 'error' && (
                        <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
                          {results[selectedFilePath].message}
                        </div>
                      )}
                    </div>
                  </div>
                  {results[selectedFilePath].status === 'success' && config.overwriteSource && (
                    <span style={{ fontSize: '12px', color: '#166534', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>已覆盖原文件</span>
                  )}
                </div>
              )}
              <div className="info-grid">
                <div className="info-card">
                  <h4>原始文件信息</h4>
                  {originalInfo ? <MetadataView info={originalInfo} /> : <p>正在加载...</p>}
                </div>
                <div className="info-card">
                  <h4>处理后结果对比</h4>
                  {results[selectedFilePath]?.status === 'success' ? (
                    processedInfo ? (
                      <>
                        <MetadataView info={processedInfo} />
                        <div className="info-item" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                          <span className="info-label">体积优化</span>
                          <span className="info-value" style={{ color: '#16a34a' }}>
                            {formatSize(Math.max(0, originalInfo!.size - processedInfo.size))}
                          </span>
                        </div>
                      </>
                    ) : <p>正在加载...</p>
                  ) : results[selectedFilePath]?.status === 'error' ? (
                    <div style={{ padding: '16px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px' }}>
                      <div style={{ color: '#dc2626', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>❌</span> 处理失败
                      </div>
                      <div style={{ color: '#991b1b', fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                        {results[selectedFilePath]?.message || '未知错误，请检查文件是否被占用或损坏'}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: '40px' }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                      等待处理后对比
                    </div>
                  )}
                </div>
              </div>

              {results[selectedFilePath]?.status === 'success' && results[selectedFilePath]?.removed && (
                <div className="removed-list">
                  <h4 style={{ color: '#475569', marginBottom: '12px' }}>清理报告</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {results[selectedFilePath]?.removed?.map((item, idx) => (
                      <span key={idx} className="removed-tag">{item}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-viewer">
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
            <h3>请选择文件查看详情</h3>
            <p>点击左侧列表中的文件即可对比原始与处理后的元数据状态</p>
          </div>
        )}
      </div>

      {/* 设置 Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>设置</h3>
              {(config.outputDir || config.overwriteSource) && <button className="secondary" onClick={() => setShowSettings(false)} style={{ border: 'none' }}>×</button>}
            </div>
            <div className="controls" style={{ gridTemplateColumns: '1fr' }}>
              <div className="control" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setConfig({ ...config, overwriteSource: !config.overwriteSource })}>
                <input 
                  type="checkbox" 
                  id="overwriteSource" 
                  checked={!!config.overwriteSource} 
                  onChange={(e) => setConfig({ ...config, overwriteSource: e.target.checked })}
                  style={{ width: '16px', height: '16px' }}
                />
                <label htmlFor="overwriteSource" style={{ marginBottom: 0, cursor: 'pointer' }}>直接覆盖源文件 (危险操作，建议先备份)</label>
              </div>

              {!config.overwriteSource && (
                <div className="control">
                  <label>输出目录 (必填)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={{ flex: 1, padding: '8px' }} value={config.outputDir || ''} readOnly placeholder="请选择保存目录" />
                    <button className="secondary" onClick={selectOutputDir}>选择</button>
                  </div>
                  {config.outputDir && (
                    <button className="secondary" onClick={handleClearOutputDir} style={{ marginTop: '8px', color: '#dc2626', borderColor: '#fee2e2', width: 'fit-content' }}>
                      🗑️ 清空此目录
                    </button>
                  )}
                </div>
              )}
              <div className="control">
                <label>文件名后缀</label>
                <input style={{ padding: '8px' }} value={config.copySuffix || ''} onChange={(e) => setConfig({ ...config, copySuffix: e.target.value })} />
              </div>
            </div>
            <button onClick={() => saveSettings(config)} disabled={!config.overwriteSource && !config.outputDir} style={{ width: '100%', padding: '10px', marginTop: '20px' }}>保存并关闭</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
