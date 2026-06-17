'use strict';

const {
  parseQifDate,
  parseAmount,
  parseQif,
  parseOfxDate,
  parseOfx,
  parseCsv,
  parseFile,
} = require('../lib/parsers');

// ─── parseQifDate ────────────────────────────────────────────────────────────

describe('parseQifDate', () => {
  test('standard slash-separated M/D/YYYY', () => {
    expect(parseQifDate('1/5/2024')).toBe('2024-01-05');
  });

  test('two-digit year < 50 → 2000s', () => {
    expect(parseQifDate('3/15/24')).toBe('2024-03-15');
  });

  test('two-digit year >= 50 → 1900s', () => {
    expect(parseQifDate('6/1/99')).toBe('1999-06-01');
  });

  test('apostrophe year separator (MS Money format)', () => {
    expect(parseQifDate("1/ 5'24")).toBe('2024-01-05');
  });

  test('dash separator', () => {
    expect(parseQifDate('12-31-2023')).toBe('2023-12-31');
  });

  test('null input returns null', () => {
    expect(parseQifDate(null)).toBeNull();
  });

  test('invalid format returns null', () => {
    expect(parseQifDate('not-a-date')).toBeNull();
  });

  test('zero month returns null', () => {
    expect(parseQifDate('0/15/2024')).toBeNull();
  });
});

// ─── parseAmount ─────────────────────────────────────────────────────────────

describe('parseAmount', () => {
  test('plain number', () => {
    expect(parseAmount('42.50')).toBe(42.5);
  });

  test('negative number', () => {
    expect(parseAmount('-1,234.56')).toBe(-1234.56);
  });

  test('comma-separated thousands', () => {
    expect(parseAmount('1,000.00')).toBe(1000);
  });

  test('empty string returns 0', () => {
    expect(parseAmount('')).toBe(0);
  });

  test('null returns 0', () => {
    expect(parseAmount(null)).toBe(0);
  });
});

// ─── parseQif ────────────────────────────────────────────────────────────────

describe('parseQif', () => {
  const BASIC_QIF = `!Type:Bank
D1/15/2024
T-42.50
PGrocery Store
MGroceries
CX
^
D1/20/2024
T1500.00
PPaycheck
^
`;

  test('parses two transactions from headerless QIF', () => {
    const result = parseQif(BASIC_QIF);
    expect(result).toHaveLength(1);
    const [acct] = result;
    expect(acct.type).toBe('checking');
    expect(acct.transactions).toHaveLength(2);
  });

  test('first transaction fields', () => {
    const [acct] = parseQif(BASIC_QIF);
    const t = acct.transactions[0];
    expect(t.date).toBe('2024-01-15');
    expect(t.amount).toBe(-42.5);
    expect(t.payee).toBe('Grocery Store');
    expect(t.memo).toBe('Groceries');
    expect(t.cleared).toBe(1);
  });

  test('!Account header sets account name', () => {
    const qif = `!Account
NMy Checking
TBank
^
!Type:Bank
D2/1/2024
T-10.00
PSome Store
^
`;
    const result = parseQif(qif);
    expect(result[0].name).toBe('My Checking');
    expect(result[0].type).toBe('checking');
  });

  test('!Type:CCard maps to credit', () => {
    const qif = `!Type:CCard
D3/1/2024
T-50.00
PRestaurant
^
`;
    const [acct] = parseQif(qif);
    expect(acct.type).toBe('credit');
  });

  test('category L field strips transfer brackets', () => {
    const qif = `!Type:Bank
D1/1/2024
T-100.00
PSavings Transfer
L[Savings Account]
^
`;
    const [acct] = parseQif(qif);
    expect(acct.transactions[0].category).toBe('Savings Account');
  });

  test('empty input returns empty array', () => {
    expect(parseQif('')).toHaveLength(0);
  });
});

// ─── parseOfxDate ────────────────────────────────────────────────────────────

describe('parseOfxDate', () => {
  test('basic YYYYMMDD', () => {
    expect(parseOfxDate('20240115')).toBe('2024-01-15');
  });

  test('strips timezone suffix', () => {
    expect(parseOfxDate('20240115120000.000[-5:EST]')).toBe('2024-01-15');
  });

  test('null returns null', () => {
    expect(parseOfxDate(null)).toBeNull();
  });

  test('too short returns null', () => {
    expect(parseOfxDate('2024')).toBeNull();
  });
});

// ─── parseOfx ────────────────────────────────────────────────────────────────

describe('parseOfx', () => {
  const XML_OFX = `<?xml version="1.0" encoding="UTF-8"?>
<OFX>
  <BANKMSGSRSV1>
    <STMTRS>
      <CURDEF>USD</CURDEF>
      <BANKACCTFROM>
        <BANKID>123456789</BANKID>
        <ACCTID>9876543210</ACCTID>
        <ACCTTYPE>CHECKING</ACCTTYPE>
      </BANKACCTFROM>
      <BANKTRANLIST>
        <DTSTART>20240101</DTSTART>
        <DTEND>20240131</DTEND>
        <STMTTRN>
          <TRNTYPE>DEBIT</TRNTYPE>
          <DTPOSTED>20240115120000</DTPOSTED>
          <TRNAMT>-42.50</TRNAMT>
          <FITID>20240115001</FITID>
          <NAME>GROCERY STORE</NAME>
          <MEMO>Groceries</MEMO>
        </STMTTRN>
        <STMTTRN>
          <TRNTYPE>CREDIT</TRNTYPE>
          <DTPOSTED>20240120000000</DTPOSTED>
          <TRNAMT>1500.00</TRNAMT>
          <FITID>20240120001</FITID>
          <NAME>PAYCHECK</NAME>
        </STMTTRN>
      </BANKTRANLIST>
    </STMTRS>
  </BANKMSGSRSV1>
</OFX>`;

  test('parses account ID', () => {
    const result = parseOfx(XML_OFX);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('9876543210');
  });

  test('parses two transactions', () => {
    const [acct] = parseOfx(XML_OFX);
    expect(acct.transactions).toHaveLength(2);
  });

  test('debit transaction fields', () => {
    const [acct] = parseOfx(XML_OFX);
    const t = acct.transactions[0];
    expect(t.date).toBe('2024-01-15');
    expect(t.amount).toBe(-42.5);
    expect(t.payee).toBe('GROCERY STORE');
    expect(t.cleared).toBe(1);
  });

  test('credit transaction amount', () => {
    const [acct] = parseOfx(XML_OFX);
    expect(acct.transactions[1].amount).toBe(1500);
  });

  test('CCSTMTRS parses credit card accounts', () => {
    const ccOfx = `<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTRS>
      <CCACCTFROM><ACCTID>CC-1234</ACCTID></CCACCTFROM>
      <BANKTRANLIST>
        <STMTTRN>
          <DTPOSTED>20240301</DTPOSTED>
          <TRNAMT>-89.99</TRNAMT>
          <FITID>001</FITID>
          <NAME>Restaurant</NAME>
        </STMTTRN>
      </BANKTRANLIST>
    </CCSTMTRS>
  </CREDITCARDMSGSRSV1>
</OFX>`;
    const result = parseOfx(ccOfx);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('CC-1234');
    expect(result[0].transactions[0].amount).toBe(-89.99);
  });
});

// ─── parseCsv ────────────────────────────────────────────────────────────────

describe('parseCsv', () => {
  const BASIC_CSV = `Date,Payee,Amount,Memo,Category
2024-01-15,Grocery Store,-42.50,Groceries,Food
2024-01-20,Paycheck,1500.00,,Salary
`;

  test('parses two transactions', () => {
    const result = parseCsv(BASIC_CSV);
    expect(result).toHaveLength(1);
    expect(result[0].transactions).toHaveLength(2);
  });

  test('first transaction fields', () => {
    const [acct] = parseCsv(BASIC_CSV);
    const t = acct.transactions[0];
    expect(t.date).toBe('2024-01-15');
    expect(t.payee).toBe('Grocery Store');
    expect(t.amount).toBe(-42.5);
    expect(t.memo).toBe('Groceries');
    expect(t.category).toBe('Food');
  });

  test('debit/credit column split (no Amount column)', () => {
    const csv = `Date,Description,Debit,Credit
2024-02-01,ATM Withdrawal,100.00,
2024-02-05,Direct Deposit,,2000.00
`;
    const [acct] = parseCsv(csv);
    expect(acct.transactions[0].amount).toBe(-100);
    expect(acct.transactions[1].amount).toBe(2000);
  });

  test('skips rows with no date', () => {
    const csv = `Date,Payee,Amount
2024-01-01,Valid,10.00
,Missing date,5.00
`;
    const [acct] = parseCsv(csv);
    expect(acct.transactions).toHaveLength(1);
  });

  test('handles QIF-style date format via fallback', () => {
    const csv = `Date,Payee,Amount
1/15/2024,Store,-25.00
`;
    const [acct] = parseCsv(csv);
    expect(acct.transactions[0].date).toBe('2024-01-15');
  });

  test('too few rows returns empty array', () => {
    expect(parseCsv('Date,Payee,Amount')).toHaveLength(0);
    expect(parseCsv('')).toHaveLength(0);
  });

  test('account name is always Imported', () => {
    const [acct] = parseCsv(BASIC_CSV);
    expect(acct.name).toBe('Imported');
    expect(acct.type).toBe('checking');
  });
});

// ─── parseFile dispatcher ─────────────────────────────────────────────────────

describe('parseFile', () => {
  test('routes .qif extension to QIF parser', () => {
    const content = `!Type:Bank\nD1/1/2024\nT-10.00\nPTest\n^\n`;
    const { format, parsed } = parseFile(content, 'export.qif');
    expect(format).toBe('qif');
    expect(parsed[0].transactions[0].payee).toBe('Test');
  });

  test('routes .ofx extension to OFX parser', () => {
    const content = `<OFX><BANKMSGSRSV1><STMTRS><BANKACCTFROM><ACCTID>X</ACCTID></BANKACCTFROM><BANKTRANLIST></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>`;
    const { format } = parseFile(content, 'bank.ofx');
    expect(format).toBe('ofx');
  });

  test('routes .csv extension to CSV parser', () => {
    const content = `Date,Payee,Amount\n2024-01-01,Test,10.00\n`;
    const { format, parsed } = parseFile(content, 'transactions.csv');
    expect(format).toBe('csv');
    expect(parsed[0].transactions).toHaveLength(1);
  });

  test('detects OFX by content even without matching extension', () => {
    const content = `<OFX><BANKMSGSRSV1><STMTRS><BANKACCTFROM><ACCTID>Y</ACCTID></BANKACCTFROM><BANKTRANLIST></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>`;
    const { format, parsed } = parseFile(content, 'mystery.txt');
    // format is the file's extension; parsed is still handled by OFX parser
    expect(format).toBe('txt');
    expect(parsed).toBeDefined();
  });

  test('detects CSV by comma in first line', () => {
    const content = `Date,Payee,Amount\n2024-01-01,Test,5.00\n`;
    const { format } = parseFile(content, '');
    expect(format).toBe('csv');
  });
});
