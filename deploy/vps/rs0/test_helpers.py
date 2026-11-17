import gzip
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest


def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

uri=module('prepare_uri');preflight=module('preflight')
class HelperTests(unittest.TestCase):
    def config(self):
        return {'name':'apollo-homologacao','services':{'apollo':{'environment':{'DB_NAME':'apollo_homologacao','MONGO_URL':'mongodb://root:p%40ss@mongo:27017/apollo_homologacao?authSource=admin'}}}}
    def test_preserves_encoded_credentials_and_adds_rs0(self):
        value=uri.rs0_uri(self.config()['services']['apollo']['environment']['MONGO_URL'])
        self.assertIn('root:p%40ss@mongo:27017',value);self.assertIn('replicaSet=rs0',value)
    def test_invalid_targets(self):
        for value in ['mongodb://u:p@production:27017/apollo_pdv','mongodb://u:p@mongo/apollo_pdv','mongodb+srv://u:p@mongo/','mongodb://mongo/apollo_homologacao']:
            with self.subTest(value=value),self.assertRaises(ValueError):uri.rs0_uri(value)
    def test_duplicate_and_wrong_options(self):
        for query in ['replicaSet=other','replicaSet=rs0&replicaSet=rs0','authSource=other','proxyHost=example.invalid']:
            with self.subTest(query=query),self.assertRaises(ValueError):uri.rs0_uri('mongodb://u:p@mongo/apollo_homologacao?'+query)
    def test_profile_rejected_before_write(self):
        c=self.config();c['services']['apollo']['environment']['APOLLO_ENV']='homologation'
        with self.assertRaises(ValueError):uri.private_override(c,Path('/not-created'))
    def test_private_output_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'uri.json';uri.private_override(self.config(),p)
            self.assertEqual(p.stat().st_mode & 0o777,0o600)
            original=p.read_bytes()
            with self.assertRaises(FileExistsError):uri.private_override(self.config(),p)
            self.assertEqual(p.read_bytes(),original)
    def test_wrong_project_no_write(self):
        c=self.config();c['name']='apollo-pdv'
        with self.assertRaises(ValueError):uri.private_override(c,'/not-created')
    def test_backup_summary_read_only(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'dump.gz';p.write_bytes(gzip.compress(b'mock not BSON'))
            original=p.read_bytes();summary=preflight.backup_summary(p)
            self.assertEqual(summary['uncompressed_bytes'],13);self.assertEqual(p.read_bytes(),original)
    def test_corrupt_and_symlink_backup(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'dump.gz';p.write_bytes(b'bad')
            with self.assertRaises(OSError):preflight.backup_summary(p)
            link=Path(d)/'link';link.symlink_to(p)
            with self.assertRaises(ValueError):preflight.backup_summary(link)
if __name__=='__main__':unittest.main()
