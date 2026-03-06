import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('\n🔍 Testing Supabase Storage Connection...\n');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing credentials:');
  console.error('   SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.error('   SUPABASE_KEY:', supabaseKey ? '✅ Set' : '❌ Missing');
  process.exit(1);
}

console.log('✅ Credentials found');
console.log('   URL:', supabaseUrl);
console.log('   Key:', supabaseKey.substring(0, 20) + '...');

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function testBucket() {
  try {
    console.log('\n📦 Fetching buckets list...');
    
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('❌ Error listing buckets:', error);
      return;
    }

    console.log('\n✅ Successfully connected to Supabase Storage!');
    console.log('\n📋 Available buckets:');
    
    if (!buckets || buckets.length === 0) {
      console.log('   (No buckets found)');
    } else {
      buckets.forEach(bucket => {
        const isTarget = bucket.name === 'conversation-audio';
        const icon = isTarget ? '🎯' : '  ';
        const status = bucket.public ? 'PUBLIC' : 'PRIVATE';
        console.log(`   ${icon} ${bucket.name} (${status})`);
      });
    }

    // Check for conversation-audio bucket
    const targetBucket = buckets?.find(b => b.name === 'conversation-audio');
    
    if (targetBucket) {
      console.log('\n✅ Target bucket "conversation-audio" FOUND!');
      console.log('   Status:', targetBucket.public ? 'PUBLIC ✅' : 'PRIVATE ⚠️');
      console.log('   ID:', targetBucket.id);
    } else {
      console.log('\n❌ Target bucket "conversation-audio" NOT FOUND');
      console.log('   Available buckets:', buckets?.map(b => b.name).join(', ') || 'none');
    }
    
  } catch (error) {
    console.error('\n❌ Exception occurred:', error);
  }
}

testBucket();
