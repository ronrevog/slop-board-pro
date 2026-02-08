
import React, { useState, useRef, useMemo } from 'react';
import { Project, Character, Location, Shot, Scene } from '../types';
import { generateKlingV2VReference, generateKlingV26MotionControl, KlingElementInput, uploadFileToFal } from '../services/falService';
import { Upload, Play, X, Plus, ImageIcon, Film, Users, MapPin, Camera, Loader2, Download, AlertCircle, Check, Clapperboard, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from './Button';

type KlingModel = 'o3' | 'v26';

interface ProjectImage {
    id: string;
    url: string;
    label: string;
    category: 'character' | 'location' | 'shot';
    sourceId: string; // character/location/shot id
    sourceName: string;
}

interface MotionControlProps {
    project: Project;
}

export const MotionControl: React.FC<MotionControlProps> = ({ project }) => {
    // --- State ---
    const [model, setModel] = useState<KlingModel>('o3');

    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
    const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string>('');
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);

    const [prompt, setPrompt] = useState('');
    const [duration, setDuration] = useState('5');
    const [aspectRatio, setAspectRatio] = useState<'auto' | '16:9' | '9:16' | '1:1'>('auto');
    const [keepAudio, setKeepAudio] = useState(true);

    // v2.6 specific state
    const [v26RefImageUrl, setV26RefImageUrl] = useState<string>('');
    const [v26CharOrientation, setV26CharOrientation] = useState<'image' | 'video'>('video');

    const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
    const [elements, setElements] = useState<KlingElementInput[]>([]);

    const [isGenerating, setIsGenerating] = useState(false);
    const [progressStatus, setProgressStatus] = useState('');
    const [error, setError] = useState('');
    const [resultVideoUrl, setResultVideoUrl] = useState('');

    const [imageBrowserOpen, setImageBrowserOpen] = useState(false);
    const [imageBrowserMode, setImageBrowserMode] = useState<'reference' | 'element-frontal' | 'element-ref'>('reference');
    const [activeElementIndex, setActiveElementIndex] = useState(0);

    const videoInputRef = useRef<HTMLInputElement>(null);

    const falApiKey = project.videoSettings?.falApiKey || '';

    // --- Collect all project images ---
    const allProjectImages = useMemo<ProjectImage[]>(() => {
        const images: ProjectImage[] = [];

        // Characters
        project.characters.forEach(char => {
            if (char.imageUrl) {
                images.push({ id: `char-${char.id}`, url: char.imageUrl, label: char.name, category: 'character', sourceId: char.id, sourceName: char.name });
            }
            char.turnaroundImages?.forEach((ta, i) => {
                if (ta.imageUrl) {
                    images.push({ id: `char-ta-${char.id}-${i}`, url: ta.imageUrl, label: `${char.name} (${ta.angle})`, category: 'character', sourceId: char.id, sourceName: char.name });
                }
            });
        });

        // Locations
        project.locations.forEach(loc => {
            if (loc.imageUrl) {
                images.push({ id: `loc-${loc.id}`, url: loc.imageUrl, label: loc.name, category: 'location', sourceId: loc.id, sourceName: loc.name });
            }
            loc.turnaroundImages?.forEach((ta, i) => {
                if (ta.imageUrl) {
                    images.push({ id: `loc-ta-${loc.id}-${i}`, url: ta.imageUrl, label: `${loc.name} (${ta.angle})`, category: 'location', sourceId: loc.id, sourceName: loc.name });
                }
            });
        });

        // Shots from all scenes
        project.scenes.forEach(scene => {
            scene.shots.forEach(shot => {
                if (shot.imageUrl) {
                    images.push({ id: `shot-${shot.id}`, url: shot.imageUrl, label: `${scene.name} — Shot #${shot.number}`, category: 'shot', sourceId: shot.id, sourceName: `Shot #${shot.number}` });
                }
            });
        });

        return images;
    }, [project]);

    // --- Handlers ---

    const handleVideoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setVideoFile(file);
        setVideoPreviewUrl(URL.createObjectURL(file));
        setUploadedVideoUrl('');
        setError('');
        setResultVideoUrl('');

        // Auto-upload to fal storage
        if (!falApiKey) {
            setError('fal.ai API key required. Set it in Settings → Video Provider.');
            return;
        }
        setIsUploadingVideo(true);
        try {
            const url = await uploadFileToFal(file, falApiKey);
            setUploadedVideoUrl(url);
        } catch (err: any) {
            setError(`Video upload failed: ${err.message}`);
        } finally {
            setIsUploadingVideo(false);
        }
    };

    const handleToggleImageSelection = (imageUrl: string) => {
        if (imageBrowserMode === 'reference') {
            setSelectedImageUrls(prev =>
                prev.includes(imageUrl)
                    ? prev.filter(u => u !== imageUrl)
                    : prev.length < 4 ? [...prev, imageUrl] : prev
            );
        } else if (imageBrowserMode === 'element-frontal') {
            setElements(prev => {
                const updated = [...prev];
                updated[activeElementIndex] = { ...updated[activeElementIndex], frontal_image_url: imageUrl };
                return updated;
            });
            setImageBrowserOpen(false);
        } else if (imageBrowserMode === 'element-ref') {
            setElements(prev => {
                const updated = [...prev];
                const current = updated[activeElementIndex]?.reference_image_urls || [];
                if (current.length < 3) {
                    updated[activeElementIndex] = { ...updated[activeElementIndex], reference_image_urls: [...current, imageUrl] };
                }
                return updated;
            });
        }
    };

    const handleAddElement = () => {
        setElements(prev => [...prev, { frontal_image_url: undefined, reference_image_urls: [] }]);
    };

    const handleRemoveElement = (idx: number) => {
        setElements(prev => prev.filter((_, i) => i !== idx));
    };

    const handleGenerate = async () => {
        if (!uploadedVideoUrl) {
            setError('Please upload a source video first.');
            return;
        }
        if (!falApiKey) {
            setError('fal.ai API key required. Set it in Settings → Video Provider.');
            return;
        }

        // v2.6 requires a reference image
        if (model === 'v26' && !v26RefImageUrl) {
            setError('Please select a reference image for v2.6 Motion Control.');
            return;
        }

        setIsGenerating(true);
        setError('');
        setResultVideoUrl('');
        setProgressStatus('Starting...');

        try {
            let resultUrl: string;

            if (model === 'v26') {
                // --- Kling v2.6 Motion Control ---
                setProgressStatus('Uploading reference image...');
                const imgResp = await fetch(v26RefImageUrl);
                const imgBlob = await imgResp.blob();
                const imgFile = new File([imgBlob], 'ref-image.png', { type: imgBlob.type || 'image/png' });
                const uploadedImageUrl = await uploadFileToFal(imgFile, falApiKey);

                resultUrl = await generateKlingV26MotionControl(
                    uploadedImageUrl,
                    uploadedVideoUrl,
                    prompt,
                    {
                        characterOrientation: v26CharOrientation,
                        keepOriginalSound: keepAudio,
                    },
                    falApiKey,
                    (status) => setProgressStatus(status)
                );
            } else {
                // --- Kling O3 Pro V2V Reference ---
                if (!prompt.trim()) {
                    setError('Please enter a prompt.');
                    setIsGenerating(false);
                    return;
                }

                // Upload selected reference images to fal storage
                const uploadedImageUrls: string[] = [];
                for (const imgUrl of selectedImageUrls) {
                    setProgressStatus(`Uploading reference image ${uploadedImageUrls.length + 1}/${selectedImageUrls.length}...`);
                    const response = await fetch(imgUrl);
                    const blob = await response.blob();
                    const file = new File([blob], `ref-${uploadedImageUrls.length}.png`, { type: blob.type || 'image/png' });
                    const url = await uploadFileToFal(file, falApiKey);
                    uploadedImageUrls.push(url);
                }

                // Upload element images
                const uploadedElements: KlingElementInput[] = [];
                for (const elem of elements) {
                    let frontalUrl: string | undefined;
                    let refUrls: string[] = [];

                    if (elem.frontal_image_url) {
                        setProgressStatus('Uploading element frontal image...');
                        const resp = await fetch(elem.frontal_image_url);
                        const blob = await resp.blob();
                        const file = new File([blob], 'element-frontal.png', { type: blob.type || 'image/png' });
                        frontalUrl = await uploadFileToFal(file, falApiKey);
                    }

                    if (elem.reference_image_urls?.length) {
                        for (const refImg of elem.reference_image_urls) {
                            setProgressStatus('Uploading element reference image...');
                            const resp = await fetch(refImg);
                            const blob = await resp.blob();
                            const file = new File([blob], 'element-ref.png', { type: blob.type || 'image/png' });
                            const url = await uploadFileToFal(file, falApiKey);
                            refUrls.push(url);
                        }
                    }

                    if (frontalUrl || refUrls.length > 0) {
                        uploadedElements.push({ frontal_image_url: frontalUrl, reference_image_urls: refUrls.length > 0 ? refUrls : undefined });
                    }
                }

                resultUrl = await generateKlingV2VReference(
                    uploadedVideoUrl,
                    prompt,
                    {
                        imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
                        elements: uploadedElements.length > 0 ? uploadedElements : undefined,
                        aspectRatio,
                        duration,
                        keepAudio,
                    },
                    falApiKey,
                    (status) => setProgressStatus(status)
                );
            }

            setResultVideoUrl(resultUrl);
            setProgressStatus('');
        } catch (err: any) {
            setError(err.message || 'Generation failed');
            setProgressStatus('');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadResult = () => {
        if (!resultVideoUrl) return;
        const link = document.createElement('a');
        link.href = resultVideoUrl;
        link.download = `motion-control-output.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Image Browser Modal ---
    const renderImageBrowser = () => {
        if (!imageBrowserOpen) return null;

        const categories = [
            { key: 'character' as const, label: 'Characters', icon: Users },
            { key: 'location' as const, label: 'Locations', icon: MapPin },
            { key: 'shot' as const, label: 'Shots', icon: Camera },
        ];

        return (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setImageBrowserOpen(false)}>
                <div className="bg-neutral-900 border border-neutral-700 rounded-xl max-w-4xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-blue-400" />
                            {imageBrowserMode === 'reference' ? 'Select Reference Images (max 4)' : imageBrowserMode === 'element-frontal' ? 'Select Frontal Image for Element' : 'Select Reference Images for Element (max 3)'}
                        </h3>
                        <button onClick={() => setImageBrowserOpen(false)} className="text-neutral-500 hover:text-white"><X className="w-5 h-5" /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {categories.map(cat => {
                            const catImages = allProjectImages.filter(img => img.category === cat.key);
                            if (catImages.length === 0) return null;
                            return (
                                <div key={cat.key}>
                                    <h4 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <cat.icon className="w-3 h-3" /> {cat.label} ({catImages.length})
                                    </h4>
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                                        {catImages.map(img => {
                                            const isSelected = imageBrowserMode === 'reference'
                                                ? selectedImageUrls.includes(img.url)
                                                : false;
                                            return (
                                                <button
                                                    key={img.id}
                                                    onClick={() => handleToggleImageSelection(img.url)}
                                                    className={`relative group rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-neutral-700 hover:border-neutral-500'}`}
                                                >
                                                    <img src={img.url} alt={img.label} className="w-full aspect-square object-cover" />
                                                    {isSelected && (
                                                        <div className="absolute inset-0 bg-blue-500/30 flex items-center justify-center">
                                                            <Check className="w-6 h-6 text-white" />
                                                        </div>
                                                    )}
                                                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[9px] text-neutral-300 p-1 truncate">
                                                        {img.sourceName}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                        {allProjectImages.length === 0 && (
                            <div className="text-center py-12 text-neutral-500">
                                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>No images in project yet. Generate some character, location, or shot images first.</p>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-neutral-800 flex justify-end">
                        <Button variant="primary" onClick={() => setImageBrowserOpen(false)}>Done</Button>
                    </div>
                </div>
            </div>
        );
    };

    // --- Render ---
    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
            <div className="flex items-center gap-3 mb-2">
                <Clapperboard className="w-6 h-6 text-purple-500" />
                <h2 className="text-2xl font-serif text-white">Motion Control</h2>
            </div>

            {/* Model Switcher */}
            <div className="flex gap-2 -mt-4">
                <button
                    onClick={() => setModel('o3')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all ${model === 'o3' ? 'border-purple-600 bg-purple-900/20 text-purple-300' : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'}`}
                >
                    <div className="font-bold text-xs">Kling O3 Pro</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">V2V Reference • Elements • Multi-image</div>
                </button>
                <button
                    onClick={() => setModel('v26')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all ${model === 'v26' ? 'border-blue-600 bg-blue-900/20 text-blue-300' : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'}`}
                >
                    <div className="font-bold text-xs">Kling v2.6 Pro</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">Motion Control • Character orientation • Up to 30s</div>
                </button>
            </div>

            <p className="text-sm text-neutral-400">
                {model === 'o3'
                    ? 'Transform a reference video using Kling O3 Pro with character elements and style reference images.'
                    : 'Transfer motion from a reference video onto a character image with orientation control. Up to 30s video input.'}
            </p>

            {!falApiKey && (
                <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm text-yellow-200 font-medium">fal.ai API Key Required</p>
                        <p className="text-xs text-yellow-400/70 mt-1">Go to Settings → Video Provider → fal.ai to add your API key.</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* LEFT COLUMN — Source Video + Settings */}
                <div className="space-y-6">
                    {/* Source Video */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
                        <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Film className="w-4 h-4 text-purple-400" /> Source Video
                        </h3>

                        {videoPreviewUrl ? (
                            <div className="relative">
                                <video
                                    src={videoPreviewUrl}
                                    controls
                                    className="w-full rounded-lg border border-neutral-700"
                                    style={{ maxHeight: '300px' }}
                                />
                                <button
                                    onClick={() => { setVideoFile(null); setVideoPreviewUrl(''); setUploadedVideoUrl(''); }}
                                    className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full hover:bg-red-500"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                {isUploadingVideo && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
                                        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                                        <span className="ml-2 text-sm text-white">Uploading to fal.ai...</span>
                                    </div>
                                )}
                                {uploadedVideoUrl && !isUploadingVideo && (
                                    <div className="absolute top-2 left-2 bg-green-600 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Uploaded
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={() => videoInputRef.current?.click()}
                                className="w-full border-2 border-dashed border-neutral-700 hover:border-purple-600 rounded-lg py-12 flex flex-col items-center gap-3 text-neutral-500 hover:text-purple-400 transition-colors"
                            >
                                <Upload className="w-8 h-8" />
                                <span className="text-sm font-medium">Upload Video (.mp4/.mov, 3-10s)</span>
                                <span className="text-xs text-neutral-600">720-2160px, max 200MB</span>
                            </button>
                        )}
                        <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={handleVideoFileSelect} />
                    </div>

                    {/* Generation Settings */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
                        <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-widest mb-2">Settings</h3>

                        {model === 'o3' ? (
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Duration</label>
                                    <select value={duration} onChange={e => setDuration(e.target.value)} className="mt-1 w-full bg-neutral-800 text-xs text-white border border-neutral-700 rounded px-2 py-1.5 outline-none">
                                        {['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'].map(d => (
                                            <option key={d} value={d}>{d}s</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Aspect Ratio</label>
                                    <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value as any)} className="mt-1 w-full bg-neutral-800 text-xs text-white border border-neutral-700 rounded px-2 py-1.5 outline-none">
                                        <option value="auto">Auto</option>
                                        <option value="16:9">16:9</option>
                                        <option value="9:16">9:16</option>
                                        <option value="1:1">1:1</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Keep Audio</label>
                                    <button
                                        onClick={() => setKeepAudio(!keepAudio)}
                                        className={`mt-1 w-full text-xs px-2 py-1.5 rounded border transition-colors ${keepAudio ? 'bg-green-900/30 border-green-700 text-green-400' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}
                                    >
                                        {keepAudio ? 'Yes' : 'No'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Character Orientation</label>
                                        <select value={v26CharOrientation} onChange={e => setV26CharOrientation(e.target.value as 'image' | 'video')} className="mt-1 w-full bg-neutral-800 text-xs text-white border border-neutral-700 rounded px-2 py-1.5 outline-none">
                                            <option value="video">Video (match ref video, max 30s)</option>
                                            <option value="image">Image (match ref image, max 10s)</option>
                                        </select>
                                        <p className="text-[9px] text-neutral-600 mt-1">
                                            {v26CharOrientation === 'video'
                                                ? "'video': Better for complex motions. Output matches reference video orientation."
                                                : "'image': Better for camera movements. Output matches reference image orientation."}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Keep Original Sound</label>
                                        <button
                                            onClick={() => setKeepAudio(!keepAudio)}
                                            className={`mt-1 w-full text-xs px-2 py-1.5 rounded border transition-colors ${keepAudio ? 'bg-green-900/30 border-green-700 text-green-400' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}
                                        >
                                            {keepAudio ? 'Yes' : 'No'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Prompt */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
                        <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-widest mb-3">Prompt</h3>
                        <textarea
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder="Describe the motion/transformation. Use @Video1 for video, @Image1/@Image2 for ref images, @Element1/@Element2 for characters..."
                            rows={4}
                            maxLength={2500}
                            className="w-full bg-neutral-800 text-sm text-white border border-neutral-700 rounded-lg px-3 py-2 outline-none focus:border-purple-600 resize-none placeholder-neutral-600"
                        />
                        <div className="text-right text-[10px] text-neutral-600 mt-1">{prompt.length}/2500</div>
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="space-y-6">
                    {model === 'v26' ? (
                        /* v2.6 — Single Reference Image (Required) */
                        <div className="bg-neutral-900 border border-blue-900/30 rounded-lg p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-widest flex items-center gap-2">
                                    <ImageIcon className="w-4 h-4 text-blue-400" /> Reference Image <span className="text-red-500 text-[10px]">Required</span>
                                </h3>
                            </div>
                            <p className="text-[10px] text-neutral-500 mb-3">
                                Character/scene reference image. Characters should have clear body proportions, avoid occlusion, and occupy &gt;5% of image area.
                            </p>

                            {v26RefImageUrl ? (
                                <div className="relative group/v26img inline-block">
                                    <img src={v26RefImageUrl} alt="Reference" className="w-48 h-48 object-cover rounded-lg border-2 border-blue-600" />
                                    <button
                                        onClick={() => setV26RefImageUrl('')}
                                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover/v26img:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                                    {allProjectImages.length > 0 ? allProjectImages.map(img => (
                                        <button
                                            key={img.id}
                                            onClick={() => setV26RefImageUrl(img.url)}
                                            className="relative group rounded-lg overflow-hidden border-2 border-neutral-700 hover:border-blue-500 transition-all"
                                        >
                                            <img src={img.url} alt={img.label} className="w-full aspect-square object-cover" />
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[9px] text-neutral-300 p-1 truncate">
                                                {img.sourceName}
                                            </div>
                                        </button>
                                    )) : (
                                        <div className="col-span-full text-center py-8 text-neutral-500 text-xs">
                                            No images in project yet.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* O3 — Reference Images (multi) */
                        <>
                            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-widest flex items-center gap-2">
                                        <ImageIcon className="w-4 h-4 text-blue-400" /> Reference Images
                                    </h3>
                                    <button
                                        onClick={() => { setImageBrowserMode('reference'); setImageBrowserOpen(true); }}
                                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded transition-colors"
                                    >
                                        <Plus className="w-3 h-3" /> Browse Project Images
                                    </button>
                                </div>
                                <p className="text-[10px] text-neutral-500 mb-3">Style/appearance references. Referenced in prompt as @Image1, @Image2, etc. Max 4 total.</p>

                                {selectedImageUrls.length > 0 ? (
                                    <div className="flex gap-2 flex-wrap">
                                        {selectedImageUrls.map((url, idx) => (
                                            <div key={idx} className="relative group/img flex-shrink-0">
                                                <img src={url} alt={`Ref ${idx + 1}`} className="w-20 h-20 object-cover rounded-lg border border-neutral-700" />
                                                <div className="absolute top-1 left-1 bg-blue-600 text-white text-[9px] px-1 rounded font-bold">@Image{idx + 1}</div>
                                                <button
                                                    onClick={() => setSelectedImageUrls(prev => prev.filter((_, i) => i !== idx))}
                                                    className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-neutral-600 italic">No reference images selected</div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Elements (Characters/Objects) — O3 only */}
                    {model === 'o3' && (
                        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-widest flex items-center gap-2">
                                    <Users className="w-4 h-4 text-green-400" /> Elements
                                </h3>
                                <button
                                    onClick={handleAddElement}
                                    className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded transition-colors"
                                >
                                    <Plus className="w-3 h-3" /> Add Element
                                </button>
                            </div>
                            <p className="text-[10px] text-neutral-500 mb-3">Characters/objects to inject. Referenced in prompt as @Element1, @Element2, etc.</p>

                            {elements.length > 0 ? (
                                <div className="space-y-3">
                                    {elements.map((elem, idx) => (
                                        <div key={idx} className="bg-neutral-800 rounded-lg p-3 border border-neutral-700">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-bold text-green-400">@Element{idx + 1}</span>
                                                <button onClick={() => handleRemoveElement(idx)} className="text-neutral-600 hover:text-red-500"><X className="w-3 h-3" /></button>
                                            </div>
                                            <div className="flex gap-3">
                                                {/* Frontal */}
                                                <div>
                                                    <span className="text-[10px] text-neutral-500 block mb-1">Frontal</span>
                                                    {elem.frontal_image_url ? (
                                                        <div className="relative group/ef">
                                                            <img src={elem.frontal_image_url} className="w-16 h-16 object-cover rounded border border-neutral-600" />
                                                            <button
                                                                onClick={() => setElements(prev => { const u = [...prev]; u[idx] = { ...u[idx], frontal_image_url: undefined }; return u; })}
                                                                className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover/ef:opacity-100 transition-opacity"
                                                            ><X className="w-2.5 h-2.5" /></button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => { setActiveElementIndex(idx); setImageBrowserMode('element-frontal'); setImageBrowserOpen(true); }}
                                                            className="w-16 h-16 border-2 border-dashed border-neutral-600 hover:border-green-600 rounded flex items-center justify-center text-neutral-600 hover:text-green-400 transition-colors"
                                                        ><Plus className="w-4 h-4" /></button>
                                                    )}
                                                </div>
                                                {/* References */}
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[10px] text-neutral-500">Angle Refs (1-3)</span>
                                                        {(elem.reference_image_urls?.length || 0) < 3 && (
                                                            <button
                                                                onClick={() => { setActiveElementIndex(idx); setImageBrowserMode('element-ref'); setImageBrowserOpen(true); }}
                                                                className="text-[10px] text-green-400 hover:text-green-300"
                                                            ><Plus className="w-3 h-3 inline" /> Add</button>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-1.5">
                                                        {elem.reference_image_urls?.map((url, ri) => (
                                                            <div key={ri} className="relative group/er">
                                                                <img src={url} className="w-12 h-12 object-cover rounded border border-neutral-600" />
                                                                <button
                                                                    onClick={() => setElements(prev => { const u = [...prev]; u[idx] = { ...u[idx], reference_image_urls: u[idx].reference_image_urls?.filter((_, i) => i !== ri) }; return u; })}
                                                                    className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover/er:opacity-100 transition-opacity"
                                                                ><X className="w-2.5 h-2.5" /></button>
                                                            </div>
                                                        ))}
                                                        {(!elem.reference_image_urls || elem.reference_image_urls.length === 0) && (
                                                            <span className="text-[10px] text-neutral-600 italic mt-3">No angle refs</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs text-neutral-600 italic">No elements added — add characters/objects to inject into the video</div>
                            )}
                        </div>
                    )}

                    {/* Generate Button */}
                    <Button
                        variant="primary"
                        size="lg"
                        onClick={handleGenerate}
                        isLoading={isGenerating}
                        disabled={!uploadedVideoUrl || isGenerating || !falApiKey || (model === 'o3' && !prompt.trim()) || (model === 'v26' && !v26RefImageUrl)}
                        className="w-full py-3 text-base"
                    >
                        {isGenerating ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> {progressStatus || 'Generating...'}
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Play className="w-4 h-4" /> Generate Motion Control Video
                            </span>
                        )}
                    </Button>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-red-300">{error}</p>
                        </div>
                    )}

                    {/* Result Video */}
                    {resultVideoUrl && (
                        <div className="bg-neutral-900 border border-green-800 rounded-lg p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-green-400 uppercase tracking-widest flex items-center gap-2">
                                    <Check className="w-4 h-4" /> Result
                                </h3>
                                <button
                                    onClick={handleDownloadResult}
                                    className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded transition-colors"
                                >
                                    <Download className="w-3 h-3" /> Download
                                </button>
                            </div>
                            <video
                                src={resultVideoUrl}
                                controls
                                className="w-full rounded-lg border border-neutral-700"
                                style={{ maxHeight: '400px' }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Image Browser Modal */}
            {renderImageBrowser()}
        </div>
    );
};
