# 05 — Configuration (Phase 11)

"Toutes les règles doivent être modifiables" — table `payroll_config` (une ligne par établissement) + deux
catalogues (`types_primes`, `types_retenues`), gérés depuis `/pro/paie/configuration`.

| Règle demandée | Colonne | Valeur par défaut | Modifiable via l'UI construite |
|---|---|---|---|
| Devise | `payroll_config.devise` | `'FCFA'` | Oui |
| Fréquence de paie | `payroll_config.frequence_paie` | `'mensuelle'` (mensuelle/quinzaine/hebdomadaire) | Oui |
| Primes | `types_primes` (catalogue, nom + montant par défaut + récurrente) | — | Non — table préparée, aucune interface de gestion du catalogue construite dans cette mission (seule la saisie directe d'une prime sur une fiche personnel serait à construire ; non fait) |
| Retenues | `types_retenues` | — | Idem |
| Heures supplémentaires | `payroll_config.taux_heure_sup_multiplicateur` | `1.25` | Oui |
| Congés | `absences` (type `conge`) | — | Oui, via `/pro/absences` |
| Calendrier | `payroll_config.jour_paie` (jour du mois, 1-28) | Non défini | Oui |
| Seuil de retard | `payroll_config.seuil_retard_minutes` | `10` | Oui — **remplace le seuil codé en dur de la Mission 05** |

## Ce qui reste à construire pour une configuration complète

- Interface de gestion des catalogues `types_primes`/`types_retenues` (créer/modifier/supprimer un type de
  prime ou de retenue réutilisable) — les tables existent, câblées nulle part dans l'UI de cette mission. Le
  moteur de calcul (`calculerBulletin`) accepte déjà des primes/retenues avec un libellé libre, donc l'absence
  de cette interface ne bloque pas le calcul, seulement la réutilisation cohérente d'un même libellé d'une
  période à l'autre.
- Le calendrier de congés/vacances de l'établissement (`conges_vacances`, Mission 05) et les congés individuels
  (`absences`, cette mission) restent deux tables **séparées**, non réconciliées — un congé individuel déclaré
  n'apparaît pas automatiquement dans le calendrier d'établissement et inversement. Décision de conception à
  trancher avant une V2 (faut-il les fusionner ?).
