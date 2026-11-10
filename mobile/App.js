import React from 'react';
import { StyleSheet, View } from 'react-native';
import NutriScanner from './components/NutriScanner';

export default function App() {
  return (
    <View style={styles.container}>
      <NutriScanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
});
