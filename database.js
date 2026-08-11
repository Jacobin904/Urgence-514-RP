/**
 * ============================================================
 * URGENCE 514 RP - MODULE DE BASE DE DONNÉES
 * ============================================================
 * Architecture : SQLite-like en mémoire + persistance GitHub
 * - Cache ultra-rapide en mémoire (Map)
 * - Sauvegarde automatique sur GitHub à chaque changement
 * - Rechargement depuis GitHub au démarrage (persistance)
 * - Retry automatique en cas d'échec
 * ============================================================
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');

class Database {
  constructor(config = {}) {
    this.githubToken = config.githubToken || '';
    this.githubRepo = config.githubRepo || '';
    this.githubBranch = config.githubBranch || 'main';
    this.localFile = config.localFile || path.join(__dirname, 'applications.json');
    
    // Cache en mémoire (ultra-rapide)
    this.cache = {
      applications: new Map(),
      warnings: new Map()
    };
    
    this.ready = false;
    this.saveQueue = [];
    this.isSaving = false;
  }

  // ============================================================
  // INITIALISATION
  // ============================================================
  
  async initialize() {
    console.log('[DATABASE] Initialisation...');
    
    try {
      // 1. Charger depuis GitHub (source de vérité)
      if (this.githubToken) {
        await this._loadFromGitHub();
        console.log(`[DATABASE] ✓ Chargé depuis GitHub (${this.cache.applications.size} candidatures, ${this.cache.warnings.size} avertissements)`);
      } else {
        // Fallback : charger depuis le fichier local
        await this._loadFromLocal();
        console.log(`[DATABASE] ✓ Chargé depuis le cache local`);
      }
      
      this.ready = true;
      console.log('[DATABASE] ✓ Base de données prête');
      return true;
    } catch (error) {
      console.error(`[DATABASE] ✕ Erreur d'initialisation: ${error.message}`);
      // Tenter de charger depuis le fichier local en dernier recours
      try {
        await this._loadFromLocal();
        this.ready = true;
        console.log('[DATABASE] ✓ Chargé depuis le fallback local');
        return true;
      } catch (e) {
        console.error('[DATABASE] ✕ Impossible de charger les données');
        this.ready = true;
        return false;
      }
    }
  }

  // ============================================================
  // CANDIDATURES
  // ============================================================
  
  /**
   * Récupère toutes les candidatures
   */
  getAllApplications() {
    return Array.from(this.cache.applications.values());
  }

  /**
   * Récupère une candidature par ID Discord
   */
  getApplication(discordId) {
    return this.cache.applications.get(discordId) || null;
  }

  /**
   * Récupère les candidatures en attente
   */
  getPendingApplications() {
    return this.getAllApplications().filter(app => app.status === 'pending');
  }

  /**
   * Ajoute une nouvelle candidature
   */
  async addApplication(application) {
    const id = application.discordId;
    if (!id) throw new Error('discordId requis');
    
    // Générer un ID unique si pas présent
    if (!application.id) {
      application.id = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Ajouter les métadonnées
    application.status = application.status || 'pending';
    application.submittedAt = application.submittedAt || new Date().toISOString();
    
    this.cache.applications.set(id, application);
    await this._save();
    
    console.log(`[DATABASE] ✓ Candidature ajoutée: ${application.discordUsername} (${id})`);
    return application;
  }

  /**
   * Met à jour une candidature
   */
  async updateApplication(discordId, updates) {
    const app = this.cache.applications.get(discordId);
    if (!app) throw new Error(`Candidature introuvable: ${discordId}`);
    
    // Fusionner les mises à jour
    Object.assign(app, updates, { updatedAt: new Date().toISOString() });
    
    this.cache.applications.set(discordId, app);
    await this._save();
    
    console.log(`[DATABASE] ✓ Candidature mise à jour: ${discordId} (${updates.status || 'modifié'})`);
    return app;
  }

  /**
   * Supprime une candidature
   */
  async deleteApplication(discordId) {
    if (!this.cache.applications.has(discordId)) {
      throw new Error(`Candidature introuvable: ${discordId}`);
    }
    
    this.cache.applications.delete(discordId);
    await this._save();
    
    console.log(`[DATABASE] ✓ Candidature supprimée: ${discordId}`);
    return true;
  }

  /**
   * Compte les candidatures par statut
   */
  countApplications() {
    const apps = this.getAllApplications();
    return {
      total: apps.length,
      pending: apps.filter(a => a.status === 'pending').length,
      approved: apps.filter(a => a.status === 'approved').length,
      rejected: apps.filter(a => a.status === 'rejected').length
    };
  }

  // ============================================================
  // WARNINGS (AVERTISSEMENTS)
  // ============================================================
  
  /**
   * Récupère tous les warnings d'un utilisateur
   */
  getWarnings(discordId) {
    return this.cache.warnings.get(discordId) || [];
  }

  /**
   * Ajoute un warning
   */
  async addWarning(discordId, warning) {
    if (!this.cache.warnings.has(discordId)) {
      this.cache.warnings.set(discordId, []);
    }
    
    const warnings = this.cache.warnings.get(discordId);
    const newWarning = {
      id: `warn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...warning,
      date: warning.date || new Date().toISOString()
    };
    
    warnings.push(newWarning);
    this.cache.warnings.set(discordId, warnings);
    await this._save();
    
    console.log(`[DATABASE] ✓ Warning ajouté à ${discordId} (total: ${warnings.length})`);
    return newWarning;
  }

  /**
   * Efface tous les warnings d'un utilisateur
   */
  async clearWarnings(discordId) {
    this.cache.warnings.delete(discordId);
    await this._save();
    
    console.log(`[DATABASE] ✓ Warnings effacés pour ${discordId}`);
    return true;
  }

  // ============================================================
  // PERSISTANCE GITHUB
  // ============================================================
  
  async _loadFromGitHub() {
    const url = `https://api.github.com/repos/${this.githubRepo}/contents/applications.json?ref=${this.githubBranch}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.githubToken}`,
        'User-Agent': 'urgence-514-database'
      }
    });
    
    if (response.status === 404) {
      // Fichier n'existe pas encore
      this.cache.applications = new Map();
      this.cache.warnings = new Map();
      return;
    }
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    const parsed = JSON.parse(content || '{}');
    
    // Convertir en Map pour le cache
    this.cache.applications = new Map();
    this.cache.warnings = new Map();
    
    if (parsed.applications && Array.isArray(parsed.applications)) {
      parsed.applications.forEach(app => {
        if (app.discordId) this.cache.applications.set(app.discordId, app);
      });
    }
    
    if (parsed.warnings && typeof parsed.warnings === 'object') {
      Object.entries(parsed.warnings).forEach(([id, warnings]) => {
        this.cache.warnings.set(id, warnings);
      });
    }
  }

  async _save() {
    // Ajouter à la queue de sauvegarde
    this.saveQueue.push(Date.now());
    
    // Si déjà en train de sauvegarder, attendre
    if (this.isSaving) return;
    
    this.isSaving = true;
    
    try {
      // Attendre un peu pour regrouper les sauvegardes rapides
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Vider la queue
      this.saveQueue = [];
      
      // Sauvegarder sur GitHub
      if (this.githubToken) {
        await this._saveToGitHub();
      }
      
      // Sauvegarder localement aussi (backup)
      await this._saveToLocal();
      
    } catch (error) {
      console.error(`[DATABASE] ✕ Erreur de sauvegarde: ${error.message}`);
      // Retry dans 5 secondes
      setTimeout(() => this._save(), 5000);
    } finally {
      this.isSaving = false;
    }
  }

  async _saveToGitHub() {
    const url = `https://api.github.com/repos/${this.githubRepo}/contents/applications.json`;
    
    // Récupérer le SHA actuel (pour éviter les conflits)
    let sha = null;
    try {
      const getResponse = await fetch(`${url}?ref=${this.githubBranch}`, {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'User-Agent': 'urgence-514-database'
        }
      });
      
      if (getResponse.ok) {
        const data = await getResponse.json();
        sha = data.sha;
      }
    } catch (e) {
      // Fichier n'existe pas encore, pas de SHA
    }
    
    // Préparer les données
    const data = {
      applications: this.getAllApplications(),
      warnings: Object.fromEntries(this.cache.warnings),
      lastUpdated: new Date().toISOString(),
      version: '2.0'
    };
    
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    
    const body = {
      message: `database: update ${new Date().toISOString()}`,
      content,
      branch: this.githubBranch
    };
    
    if (sha) body.sha = sha;
    
    // Retry jusqu'à 3 fois
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${this.githubToken}`,
            'User-Agent': 'urgence-514-database',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        
        if (response.ok) {
          console.log(`[DATABASE] ✓ Sauvegardé sur GitHub (tentative ${attempt})`);
          return;
        }
        
        if (response.status === 409 || response.status === 422) {
          // Conflit, récupérer le nouveau SHA et réessayer
          console.log(`[DATABASE] ⚠ Conflit GitHub, retry ${attempt}/3`);
          const getResponse = await fetch(`${url}?ref=${this.githubBranch}`, {
            headers: {
              'Authorization': `token ${this.githubToken}`,
              'User-Agent': 'urgence-514-database'
            }
          });
          
          if (getResponse.ok) {
            const newData = await getResponse.json();
            body.sha = newData.sha;
          }
          continue;
        }
        
        throw new Error(`GitHub API error: ${response.status}`);
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  async _saveToLocal() {
    try {
      const data = {
        applications: this.getAllApplications(),
        warnings: Object.fromEntries(this.cache.warnings),
        lastUpdated: new Date().toISOString(),
        version: '2.0'
      };
      
      await fs.writeFile(this.localFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`[DATABASE] ✕ Erreur sauvegarde locale: ${error.message}`);
    }
  }

  async _loadFromLocal() {
    try {
      const content = await fs.readFile(this.localFile, 'utf8');
      const data = JSON.parse(content || '{}');
      
      this.cache.applications = new Map();
      this.cache.warnings = new Map();
      
      if (data.applications && Array.isArray(data.applications)) {
        data.applications.forEach(app => {
          if (app.discordId) this.cache.applications.set(app.discordId, app);
        });
      }
      
      if (data.warnings && typeof data.warnings === 'object') {
        Object.entries(data.warnings).forEach(([id, warnings]) => {
          this.cache.warnings.set(id, warnings);
        });
      }
    } catch (error) {
      // Fichier n'existe pas, commencer vide
      this.cache.applications = new Map();
      this.cache.warnings = new Map();
    }
  }

  // ============================================================
  // STATISTIQUES
  // ============================================================
  
  getStats() {
    return {
      applications: this.countApplications(),
      warnings: {
        total: Array.from(this.cache.warnings.values()).reduce((sum, w) => sum + w.length, 0),
        users: this.cache.warnings.size
      },
      cache: {
        applications: this.cache.applications.size,
        warnings: this.cache.warnings.size
      }
    };
  }
}

// Exporter une instance singleton
module.exports = Database;
