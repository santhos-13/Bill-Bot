import axios from 'axios';

// Define the shape of a Bill object returned from the backend
export interface Bill {
  _id: string; // MongoDB ObjectId converted to string
  vendor: string;
  amount: number;
  date: string;
  // You might add more fields as your backend returns them
}

// **IMPORTANT: Replace with your actual local IP address**
const API_URL = 'http://172.27.80.123:5000/api';
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

const ApiService = {
  // Function to upload a bill image to the backend
  uploadBill: async (imageUri: string) => {
    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg', // Adjust as needed
      name: 'bill.jpg',
    } as any);

    const response = await api.post('/upload_bill', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  // Function to get all bills from the backend
  getBills: async () => {
    const response = await api.get('/bills');
    return response.data;
  },

  // Function to get monthly summary from the backend
  getMonthlySummary: async () => {
    const response = await api.get('/bills/monthly');
    return response.data;
  },
};

export default ApiService;
