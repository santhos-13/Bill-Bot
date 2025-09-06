# backend/app.py
from pymongo import MongoClient

# Connect to MongoDB running on localhost
client = MongoClient("mongodb://localhost:27017/")

# Access (or create) a database, e.g. "mydatabase"
db = client["Bill-Bot"]  # Replace "mydatabase" with your desired database name
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_pymongo import PyMongo
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from PIL import Image
import pytesseract
import os
import re
import datetime
import logging
from bson import ObjectId

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB configuration
app.config["MONGO_URI"] = os.getenv("MONGO_URI", "mongodb://localhost:27017/billtrackerdb")
mongo = PyMongo(app)

# Upload folder configuration
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'}
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB max file size

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# --- Tesseract OCR Path Configuration (Important for Windows users) ---
# If pytesseract can't find the tesseract.exe executable, you need to set the path.
# Uncomment and modify the line below with the correct path to your tesseract.exe file.
# For example: pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_bill_info(text):
    """Enhanced bill information extraction"""
    lines = text.strip().split('\n')
    lines = [line.strip() for line in lines if line.strip()]
    
    # Extract vendor (usually first meaningful line)
    vendor = "Unknown"
    for line in lines:
        if len(line) > 3 and not re.match(r'^\d+[\d\s\-\/\.]*$', line):
            vendor = line
            break
    
    # Extract amounts - look for currency patterns
    amounts = []
    amount_patterns = [
        r'\$\s*(\d+\.?\d*)',  # $10.50 or $10
        r'(\d+\.\d{2})',      # 10.50
        r'TOTAL[:\s]*\$?\s*(\d+\.?\d*)',  # TOTAL: $10.50
        r'Amount[:\s]*\$?\s*(\d+\.?\d*)'   # Amount: $10.50
    ]
    
    for pattern in amount_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        amounts.extend([float(m) for m in matches if float(m) > 0])
    
    # Get the highest amount (likely the total)
    amount = max(amounts) if amounts else 0.0
    
    # Extract date
    date_patterns = [
        r'(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})',  # MM/DD/YYYY or MM-DD-YY
        r'(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})',    # YYYY/MM/DD
    ]
    
    extracted_date = datetime.datetime.now().strftime("%Y-%m-%d")
    for pattern in date_patterns:
        match = re.search(pattern, text)
        if match:
            try:
                date_str = match.group(1)
                # Try to parse the date
                if '/' in date_str:
                    parts = date_str.split('/')
                elif '-' in date_str:
                    parts = date_str.split('-')
                
                if len(parts) == 3:
                    if len(parts[2]) == 2:  # YY format
                        parts[2] = '20' + parts[2]
                    
                    if len(parts[0]) == 4:  # YYYY first
                        parsed_date = datetime.datetime(int(parts[0]), int(parts[1]), int(parts[2]))
                    else:  # MM/DD/YYYY
                        parsed_date = datetime.datetime(int(parts[2]), int(parts[0]), int(parts[1]))
                    
                    extracted_date = parsed_date.strftime("%Y-%m-%d")
                    break
            except:
                continue
    
    return {
        "vendor": vendor[:100],  # Limit vendor name length
        "amount": round(amount, 2),
        "date": extracted_date
    }

@app.route('/')
def home():
    return jsonify({
        "message": "Welcome to the Bill-Bot Backend API!",
        "version": "1.0",
        "endpoints": [
            "/api/upload_bill - POST - Upload bill image",
            "/api/bills - GET - Get all bills",
            "/api/bills/monthly - GET - Get monthly summary"
        ]
    })

@app.route('/api/upload_bill', methods=['POST'])
def upload_bill():
    try:
        # Check if image is in request
        if 'image' not in request.files:
            return jsonify({"error": "No image part in the request"}), 400

        image_file = request.files['image']
        if image_file.filename == '':
            return jsonify({"error": "No selected image file"}), 400
        
        if not allowed_file(image_file.filename):
            return jsonify({"error": "Invalid file type. Please upload an image."}), 400

        # Save uploaded file
        filename = secure_filename(image_file.filename)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        image_file.save(file_path)
        
        logger.info(f"File saved: {file_path}")

        try:
            # Process image with OCR
            img = Image.open(file_path)
            
            # Convert to RGB if necessary
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Extract text using OCR
            text = pytesseract.image_to_string(img)
            logger.info(f"OCR extracted text length: {len(text)}")
            
            if not text.strip():
                return jsonify({"error": "No text could be extracted from the image"}), 400
            
            # Extract bill information
            bill_info = extract_bill_info(text)
            
            # Create bill document
            bill_doc = {
                "vendor": bill_info["vendor"],
                "amount": bill_info["amount"],
                "date": bill_info["date"],
                "raw_text": text[:1000],  # Limit raw text storage
                "filename": filename,
                "created_at": datetime.datetime.utcnow()
            }
            
            # Save to database
            result = mongo.db.bills.insert_one(bill_doc)
            bill_doc['_id'] = str(result.inserted_id)
            
            # Clean up uploaded file (optional)
            # os.remove(file_path)
            
            logger.info(f"Bill saved with ID: {result.inserted_id}")
            
            return jsonify({
                "message": "Bill processed successfully!",
                "extracted_data": {
                    "vendor": bill_doc["vendor"],
                    "amount": bill_doc["amount"],
                    "date": bill_doc["date"]
                }
            }), 200
            
        except Exception as ocr_error:
            logger.error(f"OCR processing error: {str(ocr_error)}")
            # Clean up file on error
            if os.path.exists(file_path):
                os.remove(file_path)
            return jsonify({"error": "Failed to process image. Please ensure the image contains readable text."}), 400
            
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/bills', methods=['GET'])
def get_bills():
    try:
        # Get query parameters
        limit = request.args.get('limit', 50, type=int)
        sort_order = request.args.get('sort', 'desc')  # desc or asc
        
        # Build sort parameter
        sort_param = [("created_at", -1 if sort_order == 'desc' else 1)]
        
        # Query bills (exclude raw_text for performance)
        bills_cursor = mongo.db.bills.find(
            {}, 
            {'raw_text': 0, 'filename': 0}
        ).sort(sort_param).limit(limit)
        
        bills = []
        for bill in bills_cursor:
            bill['_id'] = str(bill['_id'])  # Convert ObjectId to string
            bills.append(bill)
        
        return jsonify({
            "bills": bills,
            "count": len(bills)
        }), 200
        
    except Exception as e:
        logger.error(f"Get bills error: {str(e)}")
        return jsonify({"error": "Failed to retrieve bills"}), 500

@app.route('/api/bills/monthly', methods=['GET'])
def get_monthly_summary():
    try:
        # Get current month and year
        now = datetime.datetime.now()
        start_of_month = datetime.datetime(now.year, now.month, 1)
        
        if now.month == 12:
            end_of_month = datetime.datetime(now.year + 1, 1, 1)
        else:
            end_of_month = datetime.datetime(now.year, now.month + 1, 1)
        
        # Use an aggregation pipeline to get a monthly summary
        pipeline = [
            {
                "$match": {
                    "date": {
                        "$gte": start_of_month.strftime("%Y-%m-%d"),
                        "$lt": end_of_month.strftime("%Y-%m-%d")
                    }
                }
            },
            {
                "$group": {
                    "_id": "$vendor",
                    "total_amount": {"$sum": "$amount"},
                    "count": {"$sum": 1}
                }
            },
            {
                "$sort": {"total_amount": -1}
            }
        ]
        
        summary = list(mongo.db.bills.aggregate(pipeline))
        
        total_monthly_spending = sum(item['total_amount'] for item in summary)
        
        return jsonify({
            "monthly_total": round(total_monthly_spending, 2),
            "breakdown_by_vendor": summary
        }), 200
        
    except Exception as e:
        logger.error(f"Monthly summary error: {str(e)}")
        return jsonify({"error": "Failed to generate monthly summary"}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=5000)

