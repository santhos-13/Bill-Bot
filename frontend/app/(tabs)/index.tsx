import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList // <-- This is the essential import!
  ,

  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import ApiService, { Bill } from './services/apiService';

const screenWidth = Dimensions.get('window').width;
const showToast = (message: string) => Alert.alert('Notification', message);

const HomeScreen = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [personalInsight, setPersonalInsight] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const billsResp = await ApiService.getBills();
      const summaryResp = await ApiService.getMonthlySummary();
      setBills(billsResp.bills || []);
      setMonthlyBreakdown(summaryResp.breakdown_by_vendor || []);
      setMonthlyTotal(summaryResp.monthly_total || 0);
      generateInsight(summaryResp.breakdown_by_vendor || []);
    } catch (error) {
      showToast('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const generateInsight = (breakdown: any[]) => {
    if (!breakdown || breakdown.length === 0) {
      setPersonalInsight('Start scanning and adding bills to get personalized insights!');
      return;
    }
    const topVendor = breakdown[0];
    if (topVendor.total_amount > 5000) {
      setPersonalInsight(`You spent quite a bit on ${topVendor._id}. Consider saving here.`);
    } else if (topVendor.total_amount > 2000) {
      setPersonalInsight(`Good job! Your top spending is on ${topVendor._id}. Keep it up.`);
    } else {
      setPersonalInsight('Great control over your spending. Keep tracking!');
    }
  };

  const uploadImage = async (imageUri: string) => {
    try {
      setIsUploading(true);
      const response = await ApiService.uploadBill(imageUri);
      if (response.extracted_data) {
        showToast(`Bill added: ${response.extracted_data.vendor} - ₹${response.extracted_data.amount.toFixed(2)}`);
        await loadData();
      } else if (response.error) {
        showToast(response.error);
      }
    } catch (error) {
      showToast('Failed to process bill');
    } finally {
      setIsUploading(false);
    }
  };

  const handleScanBill = () => {
    Alert.alert('Scan Bill', 'Choose an option', [
      {
        text: 'Camera',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (permission.granted) {
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              quality: 0.8,
              aspect: [4, 3]
            });
            if (!result.canceled && result.assets?.[0]) {
              await uploadImage(result.assets[0].uri);
            } else {
              showToast('Camera access denied or cancelled');
            }
          } else {
            showToast('Camera permission denied');
          }
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (permission.granted) {
            const result = await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true,
              quality: 0.8,
              aspect: [4, 3]
            });
            if (!result.canceled && result.assets?.[0]) {
              await uploadImage(result.assets[0].uri);
            } else {
              showToast('Gallery access denied or cancelled');
            }
          } else {
            showToast('Gallery permission denied');
          }
        }
      },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const renderBillItem = ({ item }: { item: Bill }) => (
    <View style={styles.billItem}>
      <View style={styles.billInfo}>
        <Text style={styles.billVendor}>{item.vendor}</Text>
        <Text style={styles.billDate}>{new Date(item.date).toLocaleDateString()}</Text>
      </View>
      <Text style={styles.billAmount}>₹{item.amount.toFixed(2)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f6f5fe' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#6a47cd" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BillBot Intelligent Tracker</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardSubtitle}>Monthly Spending</Text>
        <Text style={styles.cardAmount}>₹{monthlyTotal.toFixed(2)}</Text>
        <Text style={styles.personalInsight}>{personalInsight}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Expenses</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#6a47cd" style={{ marginTop: 32 }} />
        ) : bills.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No bills yet! Scan your first bill to get started.</Text>
          </View>
        ) : (
          <FlatList
            data={bills}
            renderItem={renderBillItem}
            keyExtractor={item => item._id}
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
      <TouchableOpacity style={styles.scanButton} onPress={handleScanBill} disabled={isUploading}>
        <Ionicons name="scan" size={28} color="#fff" />
        <Text style={styles.scanButtonText}>
          {isUploading ? 'Processing...' : 'Scan New Bill'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingBottom: 65,
    backgroundColor: '#6a47cd',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 10,
    shadowColor: '#8150ff',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 }
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.8
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 24,
    marginTop: -50,
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 22,
    elevation: 8,
    shadowColor: '#8150ff',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    alignItems: 'center'
  },
  cardSubtitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#544c87'
  },
  cardAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#6a47cd',
    marginVertical: 6
  },
  personalInsight: {
    marginTop: 6,
    fontSize: 14,
    color: '#6a47cd',
    fontStyle: 'italic',
    textAlign: 'center',
    maxWidth: '80%'
  },
  section: {
    flex: 1,
    marginHorizontal: 22,
    marginTop: 30
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#3d3561',
    marginBottom: 14
  },
  billItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
    marginVertical: 6,
    elevation: 3,
    shadowColor: '#bcaeff',
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 3 }
  },
  billInfo: {
    flex: 1
  },
  billVendor: {
    color: '#533ea2',
    fontWeight: '700',
    fontSize: 16
  },
  billDate: {
    marginTop: 4,
    opacity: 0.7,
    color: '#7b7a96',
    fontSize: 13
  },
  billAmount: {
    fontWeight: '700',
    fontSize: 18,
    color: '#7b4adc'
  },
  scanButton: {
    position: 'absolute',
    bottom: 36,
    right: 32,
    backgroundColor: '#8150ff',
    borderRadius: 36,
    height: 64,
    width: 64,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 8,
    elevation: 12,
    shadowColor: '#b6a2db',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 12 }
  },
  scanButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 8,
    fontSize: 16,
    letterSpacing: 0.5
  },
  emptyState: {
    marginTop: 80,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 17,
    fontStyle: 'italic',
    color: '#8c8bbc'
  }
});

export default HomeScreen;
