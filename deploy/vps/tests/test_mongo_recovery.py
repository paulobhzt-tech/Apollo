import gzip
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('recovery',Path(__file__).parents[1]/'mongo_recovery.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RecoveryTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)/"homologacao";self.root.mkdir(mode=0o700)
  self.env=dict(APOLLO_ENV='homologacao',APOLLO_DB='apollo_test',APOLLO_EXPECTED_DB='apollo_test',APOLLO_MONGO_CONTAINER='test-mongo',APOLLO_APP_CONTAINER='test-app',APOLLO_WRITES_QUIESCED='YES',APOLLO_BACKUP_ROOT=str(self.root),APOLLO_COMPOSE_PROJECT='test')
  self.p=patch.dict(os.environ,self.env,clear=True);self.p.start()
 def tearDown(self):self.p.stop();self.temp.cleanup()
 def bundle(self):
  b=self.root/'homologacao-test';b.mkdir();a=b/'dump.archive.gz';a.write_bytes(gzip.compress(b'mock only, not Mongo BSON'))
  (b/'manifest.json').write_text(json.dumps(dict(format=1,database='apollo_test',environment='homologacao',counts={'orders':2},consistency='writes-quiesced',sha256=m.digest(a),bytes=a.stat().st_size)))
  return b
 def test_verify(self):self.assertEqual(m.verify(self.bundle())['counts'],{'orders':2})
 def test_corruption(self):
  b=self.bundle();(b/'dump.archive.gz').write_bytes(b'bad')
  with self.assertRaises((OSError,m.Refused)):m.verify(b)
 def test_hash_mismatch(self):
  b=self.bundle();(b/'dump.archive.gz').write_bytes(gzip.compress(b'wrong'))
  with self.assertRaises(m.Refused):m.verify(b)
 def test_missing_manifest(self):
  b=self.bundle();(b/'manifest.json').unlink()
  with self.assertRaises((OSError,m.Refused)):m.verify(b)
 def test_symlink(self):
  b=self.bundle();a=b/'dump.archive.gz';a.rename(self.root/'target');a.symlink_to(self.root/'target')
  with self.assertRaises(m.Refused):m.verify(b)
 def test_settings(self):
  for key,value in [('APOLLO_DB','admin'),('APOLLO_DB','wrong'),('APOLLO_ENV','prod'),('APOLLO_WRITES_QUIESCED','NO'),('APOLLO_MONGO_CONTAINER','--bad')]:
   with self.subTest(key=key),patch.dict(os.environ,{key:value}),patch.object(m,'run') as run:
    with self.assertRaises(m.Refused):m.backup()
    run.assert_not_called()
 def test_permissions(self):
  self.root.chmod(0o755)
  with self.assertRaises(m.Refused),m.exclusive(self.root):pass
 def test_exclusive(self):
  with m.exclusive(self.root):
   with self.assertRaises(BlockingIOError),m.exclusive(self.root):pass
 def test_project_mismatch(self):
  with patch.object(m,'capture',return_value='other'):
   with self.assertRaises(m.Refused):m.backup()
 def test_database_mismatch(self):
  with patch.object(m,'capture',side_effect=['test','test','wrong']):
   with self.assertRaises(m.Refused):m.backup()
 def test_restore_guard(self):
  with patch.object(m,'run') as run:
   with self.assertRaises(m.Refused):m.restore(self.bundle())
   run.assert_not_called()
 def test_image_guard(self):
  with patch.dict(os.environ,{'APOLLO_DISPOSABLE_HOST':'YES','APOLLO_MONGO_IMAGE':'mongo:7.0'}):
   with self.assertRaises(m.Refused):m.restore(self.bundle())
 def test_crypt_guard(self):
  with patch.object(m,'run') as run:
   with self.assertRaises(m.Refused):m.upload(self.bundle())
   run.assert_not_called()
 def test_upload(self):
  with patch.dict(os.environ,{'APOLLO_CRYPT_REMOTE_VERIFIED':'YES'}),patch.object(m,'run') as run:
   m.upload(self.bundle());self.assertIn('--immutable',run.call_args_list[0].args[0]);self.assertIn('--download',run.call_args_list[1].args[0])
 def test_success_and_unique_publication(self):
  import subprocess
  def fake_run(args, **kw):
   kw['stdout'].write(gzip.compress(b'mock Mongo archive'))
  with patch.object(m,'capture',side_effect=['test','test','apollo_test','172.20.0.2','MATCH']*2),patch.object(m,'stats',return_value={'orders':2}),patch.object(m,'run',side_effect=fake_run):
   m.backup();m.backup()
  bundles=[p for p in self.root.iterdir() if p.is_dir()]
  self.assertEqual(len(bundles),2)
  for b in bundles:m.verify(b)
 def test_dump_failure_cleanup_and_preservation(self):
  import subprocess
  b=self.bundle();old=(b/'dump.archive.gz').read_bytes()
  with patch.object(m,'capture',side_effect=['test','test','apollo_test','172.20.0.2','MATCH']),patch.object(m,'stats',return_value={'orders':2}),patch.object(m,'run',side_effect=subprocess.CalledProcessError(1,['docker'])):
   with self.assertRaises(subprocess.CalledProcessError):m.backup()
  self.assertEqual((b/'dump.archive.gz').read_bytes(),old)
  self.assertFalse(list(self.root.glob('.partial-*')))
 def test_counts_changed_no_publication(self):
  def fake_run(args, **kw):kw['stdout'].write(gzip.compress(b'mock'))
  with patch.object(m,'capture',side_effect=['test','test','apollo_test','172.20.0.2','MATCH']),patch.object(m,'stats',side_effect=[{'orders':2},{'orders':3}]),patch.object(m,'run',side_effect=fake_run):
   with self.assertRaises(m.Refused):m.backup()
  self.assertFalse(list(self.root.glob('homologacao-*')))
 def test_unexpected_bundle_file(self):
  b=self.bundle();(b/'secret').write_text('do not upload')
  with self.assertRaises(m.Refused):m.verify(b)
if __name__=='__main__':unittest.main()
