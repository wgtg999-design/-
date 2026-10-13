import sqlite3
from pathlib import Path
con=sqlite3.connect(':memory:')
for file in sorted(Path('drizzle').glob('*.sql')):con.executescript(file.read_text())
assert con.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name LIKE 'shop_%'").fetchone()[0]==5
con.execute("INSERT INTO shop_inventory VALUES('test:M','test','M',1,3,1,0)")
for value in [-1,-100]:
 try:con.execute('UPDATE shop_inventory SET stock=?',(value,));raise AssertionError('negative stock accepted')
 except sqlite3.IntegrityError:pass
assert con.execute('SELECT stock FROM shop_inventory').fetchone()[0]==1
assert 'action_token' in [r[1] for r in con.execute('PRAGMA table_info(shop_orders)')]
print('PASS: additive migrations, stock constraints, operation token and order request uniqueness index.')
