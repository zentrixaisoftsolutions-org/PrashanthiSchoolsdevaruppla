# SQL Server Migration - Complete Documentation Index

## 📚 Documentation Files Overview

This folder contains complete documentation and scripts for migrating the School Management ERP API from SQLite to SQL Server.

### Quick Navigation

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **QUICKSTART_SQL_SERVER.md** | 5-minute setup guide | 5 min ⚡ |
| **SQL_SERVER_SETUP_GUIDE.md** | Complete setup reference | 15 min 📖 |
| **CONNECTION_STRING_REFERENCE.md** | Connection string examples | 5 min 🔗 |
| **PRODUCTION_DEPLOYMENT.md** | Production best practices | 20 min 🚀 |
| **This file** | Documentation index | 2 min 📋 |

---

## 🎯 Getting Started

### For Development (Windows/Mac/Linux)

1. **Start here:** [QUICKSTART_SQL_SERVER.md](QUICKSTART_SQL_SERVER.md)
   - Simple 3-step setup
   - Install SQL Server locally
   - Configure .env file
   - Run setup_database.py

### For Production Deployment

1. **Read first:** [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md)
2. **Then reference:** [SQL_SERVER_SETUP_GUIDE.md](SQL_SERVER_SETUP_GUIDE.md)
3. **Connection help:** [CONNECTION_STRING_REFERENCE.md](CONNECTION_STRING_REFERENCE.md)

### For Connection Troubleshooting

- See: [CONNECTION_STRING_REFERENCE.md](CONNECTION_STRING_REFERENCE.md) → Troubleshooting Guide section

---

## 📂 Files in This Project

### Configuration Files
```
.env                          # Database credentials (EDIT THIS)
```

### Setup Scripts
```
sql_server_setup.sql          # T-SQL: Creates database and tables
setup_database.py             # Python: Automated database creation
verify_database.py            # Python: Verify database setup
```

### Source Code (Already Updated)
```
config.py                     # Updated for SQL Server config
database.py                   # Updated with SQL Server connection
main.py                       # FastAPI application (no changes needed)
models.py                     # SQLAlchemy models (no changes needed)
requirements.txt              # Added pyodbc package
```

### Documentation (Read These)
```
QUICKSTART_SQL_SERVER.md                 # START HERE (5 min)
SQL_SERVER_SETUP_GUIDE.md                # Complete guide (15 min)
CONNECTION_STRING_REFERENCE.md           # Connection examples (5 min)
PRODUCTION_DEPLOYMENT.md                 # Production setup (20 min)
```

---

## 🚀 Quick Start Commands

### Step 1: Update Configuration
```bash
# Edit .env with your SQL Server credentials
nano .env
# OR
notepad .env  # Windows
```

### Step 2: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 3: Setup Database
```bash
# Option A: Automatic (recommended)
python setup_database.py

# Option B: Verify existing setup
python verify_database.py
```

### Step 4: Start API
```bash
python -m uvicorn main:app --reload
```

### Step 5: Access API
```
http://localhost:8000/docs
```

---

## 🔄 Configuration Examples

### Local SQL Server (Default)
```env
DB_SERVER=localhost
DB_NAME=SchoolERP
DB_USER=sa
DB_PASSWORD=YourPassword123!
DB_DRIVER=ODBC Driver 17 for SQL Server
```

### SQL Server Express (Named Instance)
```env
DB_SERVER=localhost\SQLEXPRESS
DB_NAME=SchoolERP
DB_USER=sa
DB_PASSWORD=YourPassword123!
DB_DRIVER=ODBC Driver 17 for SQL Server
```

### Remote Server
```env
DB_SERVER=192.168.1.100
DB_NAME=SchoolERP
DB_USER=sa
DB_PASSWORD=YourPassword123!
DB_DRIVER=ODBC Driver 17 for SQL Server
```

### Azure SQL Server
```env
DB_SERVER=myserver.database.windows.net
DB_NAME=SchoolERP
DB_USER=adminuser@myserver
DB_PASSWORD=YourComplexPassword123!
DB_DRIVER=ODBC Driver 17 for SQL Server
```

More examples: See [CONNECTION_STRING_REFERENCE.md](CONNECTION_STRING_REFERENCE.md)

---

## ❓ FAQ

### Q: Do I need SQL Server installed on my machine?
**A:** For development, yes. For production, you can use a remote SQL Server or Azure SQL.

### Q: What if I don't have ODBC Driver 17?
**A:** Install from: https://docs.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server

### Q: Can I use Windows Authentication instead of SQL login?
**A:** Yes, use connection string: `mssql+pyodbc:///?driver=ODBC Driver 17 for SQL Server;SERVER=localhost;DATABASE=SchoolERP;Trusted_Connection=yes;`

### Q: How do I migrate existing SQLite data?
**A:** Follow the migration guide in [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) section "Migration from SQLite"

### Q: What versions of SQL Server are supported?
**A:** SQL Server 2016 and later (Express, Developer, Standard, Enterprise)

### Q: Is the database schema automatically created?
**A:** Yes, run `python setup_database.py` to create all tables automatically.

### Q: Can I customize the database configuration?
**A:** Yes, edit `config.py` to add custom settings, or modify `.env` for standard settings.

### Q: What are the system requirements?
**A:** • SQL Server 2016+ • ODBC Driver 17 • Python 3.8+ • 2GB RAM minimum

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│         FastAPI Application              │
│  (Python 3.8+, FastAPI, Uvicorn)        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      SQLAlchemy ORM Layer               │
│  (Abstraction, Connection Pooling)      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      PyODBC Driver                      │
│  (ODBC Driver 17 for SQL Server)        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      SQL Server Database (2016+)        │
│  ODBC Protocol on Port 1433             │
│  SchoolERP Database                     │
└─────────────────────────────────────────┘
```

---

## 📊 Database Schema

### Tables Created (11 total)
1. **roles** - User roles (super_admin, admin, teacher, student, parent)
2. **users** - System users with authentication
3. **subjects** - Academic subjects
4. **teachers** - Teacher profiles
5. **teacher_subjects** - Teacher-Subject mapping
6. **classes** - School classes
7. **parents** - Parent/Guardian profiles
8. **students** - Student profiles
9. **fees** - Fee records
10. **attendance** - Daily attendance
11. **exams** - Exam results and grades

All tables include:
- ✅ Primary keys with IDENTITY
- ✅ Foreign key constraints
- ✅ Indexes on frequently queried columns
- ✅ Timestamps (created_at, updated_at)
- ✅ Active status flags

---

## 🔐 Security Highlights

### Built-in Features
- ✅ Password hashing (bcrypt)
- ✅ JWT token authentication
- ✅ Role-based access control (RBAC)
- ✅ SQL injection prevention (parameterized queries)
- ✅ CORS configured

### Production Recommendations
- ⚠️ Don't use SA account (create app-specific user)
- ⚠️ Use strong passwords (12+ chars, mixed case, numbers, symbols)
- ⚠️ Enable SQL Server audit logging
- ⚠️ Enable encryption (TLS and transparent data encryption)
- ⚠️ Restrict database access by IP
- ⚠️ Regular backups with testing

See: [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) for details

---

## 📈 Performance Tips

1. **Connection Pooling:** Pre-configured in database.py (pool_size=10, max_overflow=20)
2. **Indexes:** Created on all foreign keys and frequently queried columns
3. **Query Optimization:** Use pagination, filtering in API endpoints
4. **Database Statistics:** Maintained by SQL Server automatically
5. **Maintenance Jobs:** Configure index rebuild and statistics update jobs

---

## 🆘 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| ODBC Driver not found | Install ODBC Driver 17 from Microsoft |
| Login failed for user | Check DB_USER and DB_PASSWORD in .env |
| Cannot open database | Run `python setup_database.py` |
| Connection timeout | Verify server address and firewall |
| Slow queries | Check indexes, run verify_database.py |

Full troubleshooting: See [SQL_SERVER_SETUP_GUIDE.md](SQL_SERVER_SETUP_GUIDE.md) → Troubleshooting

---

## 🎓 Learning Resources

- **Microsoft SQL Server:** https://docs.microsoft.com/sql/
- **ODBC Drivers:** https://docs.microsoft.com/sql/connect/odbc/
- **SQLAlchemy SQL Server:** https://docs.sqlalchemy.org/dialects/mssql/
- **PyODBC:** https://github.com/mkleehammer/pyodbc/wiki
- **FastAPI:** https://fastapi.tiangolo.com/

---

## 📞 Support

### For Setup Issues
1. Run `python verify_database.py`
2. Check [CONNECTION_STRING_REFERENCE.md](CONNECTION_STRING_REFERENCE.md)
3. Review [SQL_SERVER_SETUP_GUIDE.md](SQL_SERVER_SETUP_GUIDE.md) → Troubleshooting

### For Production Issues
1. Check [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) → Troubleshooting
2. Review SQL Server error logs
3. Run diagnostic queries in SQL Server Management Studio

### Need Help?
- Check the documentation files above
- Run diagnostic scripts (setup_database.py, verify_database.py)
- Check database connection in Python

---

## ✅ Migration Checklist

- [ ] SQL Server 2016+ installed
- [ ] ODBC Driver 17 installed
- [ ] .env file updated with credentials
- [ ] Python dependencies installed (`pip install -r requirements.txt`)
- [ ] Database created (`python setup_database.py`)
- [ ] Verification passed (`python verify_database.py`)
- [ ] API started and tested
- [ ] Health check accessible (http://localhost:8000/health)
- [ ] API documentation visible (http://localhost:8000/docs)

---

## 📝 Files Modified

These files were updated to support SQL Server:

1. **config.py** - Added DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD config
2. **.env** - Changed from SQLite connection to SQL Server credentials
3. **database.py** - Updated for SQL Server with proper connection settings
4. **requirements.txt** - Added pyodbc package
5. **models.py** - Fixed column name conflict (relationship → guardian_relationship)

---

## 🚀 Next Steps

1. **Read:** [QUICKSTART_SQL_SERVER.md](QUICKSTART_SQL_SERVER.md) (5 minutes)
2. **Install:** SQL Server and ODBC Driver
3. **Configure:** Update .env file
4. **Setup:** Run `python setup_database.py`
5. **Verify:** Run `python verify_database.py`
6. **Test:** Start API and visit http://localhost:8000/docs

---

## 📋 Version Information

- **API Version:** 1.0.0
- **Database:** SQL Server 2016+
- **Python:** 3.8+
- **Framework:** FastAPI
- **ORM:** SQLAlchemy 2.0+
- **Driver:** pyodbc with ODBC Driver 17
- **Last Updated:** March 11, 2026

---

**Ready to deploy? Start with [QUICKSTART_SQL_SERVER.md](QUICKSTART_SQL_SERVER.md)! 🚀**
