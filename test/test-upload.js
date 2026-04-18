// Simple test to verify audio upload endpoint works
const testUrl = 'http://localhost:5000/api/audio/upload';

async function testAudioUpload() {
  console.log('Testing audio upload endpoint...\n');
  
  // Create a simple test audio blob
  const testData = new Uint8Array([1, 2, 3, 4, 5]);
  const blob = new Blob([testData], { type: 'audio/webm' });
  
  const formData = new FormData();
  formData.append('audio', blob, 'test.webm');
  formData.append('conversationId', 'test-123');
  formData.append('role', 'student');
  formData.append('timestamp', new Date().toISOString());
  
  try {
    const response = await fetch(testUrl, {
      method: 'POST',
      body: formData,
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Upload successful!');
      console.log('   Audio URL:', result.audioUrl);
      console.log('\n🎉 Audio storage is working correctly!');
    } else {
      console.log('❌ Upload failed');
      console.log('   Status:', response.status);
      console.log('   Error:', result.message || result);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testAudioUpload();
