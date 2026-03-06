import { StatusBar } from 'expo-status-bar';
import { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, SafeAreaView, Pressable } from 'react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import Slider from '@react-native-community/slider';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export default function App() {
    const [fadeTime, setFadeTime] = useState(3.0);
    const [octavesCount, setOctavesCount] = useState(1);
    const [activePads, setActivePads] = useState({});
    const [isDevModalVisible, setDevModalVisible] = useState(false);

    // Library structure: padId -> { uri, name, volume, soundObject }
    // Using ref to avoid re-renders when only audio object changes
    const audioLibrary = useRef({});

    // Initialize audio library for the first octave
    useEffect(() => {
        NOTES.forEach(note => {
            const padId = `pad-0-${note}`;
            if (!audioLibrary.current[padId]) {
                audioLibrary.current[padId] = { uri: null, name: 'Nenhum arquivo', volume: 1.0, sound: null };
            }
        });

        // Configure Audio permissions
        (async () => {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });
        })();
    }, []);

    const addOctave = () => {
        const newCount = octavesCount + 1;
        const nextOctaveIndex = octavesCount; // 0-based

        // Initialize empty audio items for new octave
        NOTES.forEach(note => {
            const padId = `pad-${nextOctaveIndex}-${note}`;
            audioLibrary.current[padId] = { uri: null, name: 'Nenhum arquivo', volume: 1.0, sound: null };
        });

        setOctavesCount(newCount);
    };

    const removeOctave = (index) => {
        // If it's the only one left, do nothing
        if (octavesCount <= 1) return;

        // Unload and cleanup audio for this octave
        NOTES.forEach(n => {
            const pId = `pad-${index}-${n}`;
            if (activePads[pId]) {
                stopAudio(pId);
            }
            if (audioLibrary.current[pId]?.sound) {
                audioLibrary.current[pId].sound.unloadAsync();
            }
            delete audioLibrary.current[pId];
        });

        setOctavesCount(prev => prev - 1);
    };

    const loadAudioFile = async (padId) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'audio/*',
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];
            const { sound } = await Audio.Sound.createAsync(
                { uri: file.uri },
                { isLooping: true, volume: audioLibrary.current[padId]?.volume || 1.0 }
            );

            // Unload previous sound if any
            if (audioLibrary.current[padId]?.sound) {
                await audioLibrary.current[padId].sound.unloadAsync();
            }

            audioLibrary.current[padId] = {
                ...audioLibrary.current[padId],
                uri: file.uri,
                name: file.name,
                sound: sound
            };

            // Force render to update DevModal UI
            setDevModalVisible(cur => cur);

        } catch (error) {
            console.error("Error loading audio", error);
        }
    };

    const setVolumeForPad = async (padId, value) => {
        if (audioLibrary.current[padId]) {
            audioLibrary.current[padId].volume = value;
            if (audioLibrary.current[padId].sound) {
                await audioLibrary.current[padId].sound.setVolumeAsync(value);
            }
        }
    };

    const togglePad = async (padId) => {
        const isActive = !!activePads[padId];

        if (isActive) {
            // Turn off
            const { status } = await stopAudio(padId);
            setActivePads(prev => {
                const next = { ...prev };
                delete next[padId];
                return next;
            });
        } else {
            // Turn on
            const started = await playAudio(padId);
            if (started) {
                setActivePads(prev => ({ ...prev, [padId]: true }));
            }
        }
    };

    const playAudio = async (padId) => {
        const entry = audioLibrary.current[padId];
        if (!entry || !entry.sound) {
            console.warn(`No audio mapped for ${padId}`);
            return false;
        }

        try {
            await entry.sound.setIsLoopingAsync(true);
            await entry.sound.setVolumeAsync(entry.volume);
            await entry.sound.playAsync();
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    const stopAudio = async (padId) => {
        const entry = audioLibrary.current[padId];
        if (!entry || !entry.sound) return false;

        try {
            if (fadeTime > 0) {
                // Expo AV doesn't have built-in linear audio ramps yet.
                // For a true smooth fade in React Native, we typically have to run an interval.
                // For simplicity and stability here, we implement a basic fade logic.
                let v = entry.volume;
                const step = v / (fadeTime * 10);

                const interval = setInterval(async () => {
                    v -= step;
                    if (v <= 0) {
                        clearInterval(interval);
                        await entry.sound.stopAsync();
                    } else {
                        try { await entry.sound.setVolumeAsync(v); } catch (err) { }
                    }
                }, 100);

            } else {
                await entry.sound.stopAsync();
            }
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    // Helper to get array of active octave indices
    const getOctaveIndices = () => Array.from({ length: octavesCount }, (_, i) => i);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.logo}>Infinite Pad</Text>

                <View style={styles.headerControls}>
                    <View style={styles.fadeControlWrapper}>
                        <Text style={styles.fadeLabel}>Fade: {fadeTime.toFixed(1)}s</Text>
                        <Slider
                            style={{ width: 100, height: 40 }}
                            minimumValue={0}
                            maximumValue={10}
                            step={0.1}
                            value={fadeTime}
                            onValueChange={setFadeTime}
                            minimumTrackTintColor="#6366f1"
                            maximumTrackTintColor="#2e3340"
                            thumbTintColor="#6366f1"
                        />
                    </View>
                    <TouchableOpacity onPress={() => setDevModalVisible(true)} style={styles.devBtn}>
                        <Text style={styles.devBtnText}>⚙️</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Main Workspace */}
            <ScrollView contentContainerStyle={styles.workspace} bounces={false}>
                {getOctaveIndices().map((octaveIndex) => (
                    <View key={`octave-${octaveIndex}`} style={styles.octaveWrapper}>
                        <View style={styles.octaveHeader}>
                            <Text style={styles.octaveTitle}>Oitava {octaveIndex + 1}</Text>
                            {octaveIndex > 0 && (
                                <TouchableOpacity onPress={() => removeOctave(octaveIndex)} style={styles.removeBtn}>
                                    <Text style={styles.removeBtnText}>Remover</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.padGrid}>
                            {NOTES.map(note => {
                                const padId = `pad-${octaveIndex}-${note}`;
                                const isActive = !!activePads[padId];
                                return (
                                    <Pressable
                                        key={padId}
                                        style={[styles.pad, isActive && styles.padActive]}
                                        onPress={() => togglePad(padId)}
                                    >
                                        <Text style={[styles.padText, isActive && styles.padTextActive]}>{note}</Text>
                                    </Pressable>
                                )
                            })}
                        </View>
                    </View>
                ))}

                <TouchableOpacity style={styles.addOctaveBtn} onPress={addOctave}>
                    <Text style={styles.addOctaveBtnText}>+ Adicionar Oitava</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Dev Modal */}
            <Modal visible={isDevModalVisible} animationType="slide" presentationStyle="formSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Área do Desenvolvedor</Text>
                        <TouchableOpacity onPress={() => setDevModalVisible(false)}>
                            <Text style={styles.closeBtnText}>X</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={styles.devList}>
                        <Text style={styles.devInfo}>Faça upload de sons para cada nota mapeada.</Text>

                        {getOctaveIndices().map((octaveIndex) => (
                            <View key={`dev-octave-${octaveIndex}`}>
                                <Text style={styles.devOctaveHeader}>Oitava {octaveIndex + 1}</Text>
                                {NOTES.map(note => {
                                    const padId = `pad-${octaveIndex}-${note}`;
                                    const entry = audioLibrary.current[padId];
                                    return (
                                        <View key={`dev-${padId}`} style={styles.devRow}>
                                            <Text style={styles.devNoteName}>{note}</Text>

                                            <View style={styles.fileSelector}>
                                                <TouchableOpacity style={styles.fileBtn} onPress={() => loadAudioFile(padId)}>
                                                    <Text style={styles.fileBtnText}>Escolher Audio</Text>
                                                </TouchableOpacity>
                                                <Text style={styles.fileName} numberOfLines={1}>{entry?.name || 'Nenhum'}</Text>
                                            </View>

                                            <View style={styles.volSelector}>
                                                <Text style={styles.volLabel}>Vol.</Text>
                                                <Slider
                                                    style={{ width: 80 }}
                                                    minimumValue={0}
                                                    maximumValue={2}
                                                    step={0.1}
                                                    value={entry?.volume || 1}
                                                    onValueChange={(v) => setVolumeForPad(padId, v)}
                                                    minimumTrackTintColor="#6366f1"
                                                />
                                            </View>
                                        </View>
                                    )
                                })}
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0d0f12',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2e3340',
        backgroundColor: 'rgba(13, 15, 18, 0.9)'
    },
    logo: {
        color: '#6366f1',
        fontSize: 22,
        fontWeight: '800',
    },
    headerControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    fadeControlWrapper: {
        backgroundColor: '#1a1d24',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2e3340',
        flexDirection: 'row',
        alignItems: 'center',
    },
    fadeLabel: {
        color: '#f8fafc',
        fontSize: 12,
        fontWeight: '600',
        marginRight: 8,
    },
    devBtn: {
        padding: 8,
    },
    devBtnText: {
        fontSize: 20,
    },
    workspace: {
        padding: 16,
        alignItems: 'center',
    },
    octaveWrapper: {
        backgroundColor: 'rgba(26, 29, 36, 0.4)',
        padding: 16,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#2e3340',
        width: '100%',
        maxWidth: 600,
        marginBottom: 24,
    },
    octaveHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    octaveTitle: {
        color: '#94a3b8',
        fontSize: 16,
        fontWeight: '600',
    },
    removeBtn: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    removeBtnText: {
        color: '#ef4444',
        fontSize: 12,
        fontWeight: '600',
    },
    padGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'center',
    },
    pad: {
        width: '30%',
        aspectRatio: 1,
        minWidth: 80,
        backgroundColor: '#1a1d24',
        borderWidth: 1,
        borderColor: '#2e3340',
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    padActive: {
        backgroundColor: '#6366f1',
        borderColor: '#8b5cf6',
    },
    padText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#94a3b8',
    },
    padTextActive: {
        color: '#ffffff',
    },
    addOctaveBtn: {
        backgroundColor: '#1a1d24',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: '#2e3340',
        marginBottom: 40,
    },
    addOctaveBtnText: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: '600',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#0d0f12',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#2e3340',
    },
    modalTitle: {
        color: '#f8fafc',
        fontSize: 20,
        fontWeight: 'bold',
    },
    closeBtnText: {
        color: '#94a3b8',
        fontSize: 24,
    },
    devList: {
        padding: 20,
    },
    devInfo: {
        color: '#94a3b8',
        marginBottom: 20,
    },
    devOctaveHeader: {
        color: '#f8fafc',
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 20,
        marginBottom: 10,
    },
    devRow: {
        flexDirection: 'row',
        backgroundColor: '#1a1d24',
        padding: 12,
        borderRadius: 12,
        marginBottom: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#2e3340',
    },
    devNoteName: {
        color: '#6366f1',
        fontSize: 18,
        fontWeight: 'bold',
        width: 40,
    },
    fileSelector: {
        flex: 1,
        marginHorizontal: 10,
    },
    fileBtn: {
        backgroundColor: '#2e3340',
        padding: 6,
        borderRadius: 6,
        alignSelf: 'flex-start',
        marginBottom: 4,
    },
    fileBtnText: {
        color: '#f8fafc',
        fontSize: 12,
    },
    fileName: {
        color: '#94a3b8',
        fontSize: 11,
    },
    volSelector: {
        alignItems: 'center',
    },
    volLabel: {
        color: '#94a3b8',
        fontSize: 12,
    }
});
