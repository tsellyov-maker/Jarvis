import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';

const API_BASE = 'http://IP_DO_PC:5000';

function extractReply(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.response != null) return String(data.response);
  if (data.answer != null) return String(data.answer);
  if (data.message != null) return String(data.message);
  if (data.text != null) return String(data.text);
  return null;
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const soundRef = useRef(null);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  async function playAudioUrl(url) {
    try {
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true }
      );
      soundRef.current = sound;
    } catch (err) {
      console.warn('[Jarvis] playAudioUrl falhou:', err.message);
    }
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { id: Date.now(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/jarvis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, source: 'ios-app' }),
      });

      let reply = 'Sem resposta.';
      let audioPath = null;
      if (res.ok) {
        const data = await res.json();
        const extracted = extractReply(data);
        reply = extracted != null ? extracted : JSON.stringify(data);
        if (data.audioPath) {
          audioPath = data.audioPath.startsWith('http')
            ? data.audioPath
            : `${API_BASE}${data.audioPath}`;
        }
      } else {
        reply = `Erro ${res.status}`;
      }

      const aiMsg = { id: Date.now() + 1, role: 'ai', text: reply, audioPath };
      setMessages((prev) => [...prev, aiMsg]);
      if (audioPath) {
        playAudioUrl(audioPath);
      }
    } catch (err) {
      const errMsg = { id: Date.now() + 1, role: 'ai', text: 'Erro de conexão.' };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [input, loading]);

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      <View style={styles.header}>
        <Text style={styles.title}>JARVIS</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m) => (
          <View
            key={m.id}
            style={[
              styles.bubble,
              m.role === 'user' ? styles.bubbleUser : styles.bubbleAi,
            ]}
          >
            <Text style={m.role === 'user' ? styles.textUser : styles.textAi}>
              {m.text}
            </Text>
          </View>
        ))}
        {loading && (
          <View style={styles.bubbleAi}>
            <ActivityIndicator color="#0af" />
          </View>
        )}
      </ScrollView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputWrap}
      >
        <TextInput
          style={styles.input}
          placeholder="Digite uma mensagem..."
          placeholderTextColor="#666"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
        >
          <Text style={styles.sendText}>Enviar</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingTop: 12,
    paddingBottom: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0af',
    letterSpacing: 4,
  },
  chat: {
    flex: 1,
    paddingHorizontal: 12,
  },
  chatContent: {
    paddingVertical: 12,
    gap: 10,
  },
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
    marginVertical: 2,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#0055aa',
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a1a',
    borderBottomLeftRadius: 4,
  },
  textUser: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 20,
  },
  textAi: {
    color: '#e0e0e0',
    fontSize: 15,
    lineHeight: 20,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    backgroundColor: '#0a0a0a',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    marginRight: 10,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#0af',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendBtnDisabled: {
    backgroundColor: '#1a3a4a',
  },
  sendText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
