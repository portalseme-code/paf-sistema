/**
 * ============================================================================
 * SISTEMA PAF — BACKEND (Google Apps Script)
 * ============================================================================
 * Este script é o "cérebro" do sistema: recebe pedidos do site (front-end em
 * React, hospedado no GitHub Pages) e lê/grava nas planilhas do Google Sheets
 * criadas na pasta "Sistema PAF" > "Banco de Dados", além de salvar arquivos
 * PDF na pasta "Sistema PAF" > "Arquivos".
 *
 * COMO INSTALAR (passo a passo):
 * 1. Acesse https://script.google.com (com a MESMA conta Google que é dona
 *    da pasta "Sistema PAF" no Drive).
 * 2. Clique em "Novo projeto".
 * 3. Apague o conteúdo padrão do arquivo "Código.gs" e cole TODO o conteúdo
 *    deste arquivo no lugar.
 * 4. Clique no ícone de "Salvar" (disquete) e dê um nome ao projeto, ex:
 *    "Sistema PAF - Backend".
 * 5. Clique em "Implantar" (Deploy) > "Nova implantação".
 *    - Tipo: "App da Web" (Web app)
 *    - Executar como: "Eu" (sua conta)
 *    - Quem pode acessar: "Qualquer pessoa" (Anyone)
 * 6. Clique em "Implantar". Ele vai pedir para autorizar o script a acessar
 *    suas planilhas e Drive — autorize (é normal aparecer um aviso do
 *    Google dizendo que o app não foi verificado; como é você mesmo quem
 *    criou, pode confirmar "Avançado" > "Acessar Sistema PAF - Backend").
 * 7. Copie a "URL do app da Web" que aparece — essa é a URL que o site vai
 *    usar para conversar com este script. Guarde essa URL.
 *
 * IMPORTANTE:
 * - Toda vez que você EDITAR este código depois, precisa fazer uma NOVA
 *   implantação (Implantar > Gerenciar implantações > editar > Nova versão)
 *   para as mudanças valerem no site.
 * - Antes de usar de verdade, troque o valor de SENHA_SALT abaixo por um
 *   texto secreto só seu (qualquer frase, quanto mais aleatória melhor).
 * ============================================================================
 */

// ============================================================================
// CONFIGURAÇÃO — IDs das planilhas e pastas (já preenchidos com os que
// criamos juntos no Google Drive)
// ============================================================================
const SHEETS = {
  conselhos:         '16PE8ZwsFvVRZpiiaJzEZ995OIqR8rGg_I_gaehyJL3s',
  repasses:          '1wzPU5nmopdqsiSqAlP9zk7qWhNGdEb11pTLkSrgxET8',
  categorias:        '1LL21sIYgntf0xP-7xTFzyBoCfwO3pmjVyFcptC5v8V4',
  planoItens:        '1ZPnNcsuYPSgM5RWtXz6F_3SCxlRhj_2rD8IjmxxtG04',
  arquivosPlano:     '1H0kIALrrYMmCEqPoknQ-zEezXer2HOkv1Q_BRDePQQE',
  lancamentos:       '1590AZmS7-UK36i7psnQrx1fj7qfhAArMPjjZ6-XxFtU',
  lancamentoItens:   '1j6Mlre0-wdrrKDDNz3xqS9Jk3RaxCYz0XJ_V8B_2Iuw',
  arquivosNF:        '1nh5EoPcmUhQVBHmMQET1cWe0zSQrhmBHWxf6tsphEbw',
  remanejamentos:    '19ISuvJNasC6RLZFbGm-5Om8_zv87gjgJk7sl6oS8814',
  usuarios:          '1KvDwtCLX9cwImyoc3fPviN_aI1-Jk4hzpJ1QTGY-cus',
  historicoGeral:    '1OTTUN3kkxgL20c1JiM82jThju772-SDe97IRSlW_XXQ',
  prestacoesContas:  '1okbLIsJ-CAgFeUgEPXp9IioJbRnRpXQTbggtLq_Htm8',
  prestacaoSnapshot: '1whfbX0MxFsTD8DM1aXR02mEHmg7H3lUW9_JFBycuyeY',
  rendimentos:          '1QRxrat2RsyB4ZziWugJLeytSd2KzgpiIAzBGqXTgWwY',
  rendimentoAlocacoes:  '1EVzJSCm490HIHzkbdQHEaz5RB_mseOITqKENy_XWVDA',
  lancamentoOrcamentos: '1YdktxRNhkz802h17QFBZncRny495ZfIRfM1d0F745s0',
};

// Pasta "Arquivos" (onde ficam os PDFs, organizados em subpastas por conselho)
const PASTA_ARQUIVOS_RAIZ = '1l5mIGz-IeJyXSUrzQv7KdfmyjzsNBRRj';

// TROQUE este texto por um segredo só seu antes de usar de verdade.
// Ele é usado para "embaralhar" as senhas antes de guardar — assim, mesmo
// quem abrir a planilha Usuarios não consegue ver a senha de ninguém.
const SENHA_SALT = 'TROQUE_ESTE_TEXTO_POR_ALGO_SECRETO_SEU_2026';

const NIVEIS_QUE_PRECISAM_DE_CONSELHO = [
  'Presidente do conselho',
  'Assessor educacional administrativo financeiro',
];

// ============================================================================
// PONTOS DE ENTRADA — o site chama estas duas funções
// ============================================================================

// Pedidos do tipo GET (ex: buscar todos os dados)
function doGet(e) {
  try {
    const acao = e.parameter.action;

    if (acao === 'getDb') {
      return responderJSON(montarBancoCompleto());
    }

    return responderJSON({ erro: 'Ação GET não reconhecida: ' + acao });
  } catch (erro) {
    return responderJSON({ erro: 'Erro no servidor: ' + erro.message });
  }
}

// Pedidos do tipo POST (ex: login, criar/editar/excluir registros, enviar arquivo)
function doPost(e) {
  try {
    const corpo = JSON.parse(e.postData.contents);
    const acao = corpo.action;

    if (acao === 'login') {
      return responderJSON(fazerLogin(corpo.login, corpo.senha));
    }

    if (acao === 'registrarSolicitacaoCadastro') {
      return responderJSON(registrarSolicitacaoCadastro(corpo.dados));
    }

    if (acao === 'criarUsuarioAdmin') {
      return responderJSON(criarUsuarioAdmin(corpo.dados));
    }

    if (acao === 'redefinirSenhaAdmin') {
      return responderJSON(redefinirSenhaAdmin(corpo.usuarioId));
    }

    if (acao === 'atualizarPerfilUsuario') {
      return responderJSON(atualizarPerfilUsuario(corpo.usuarioId, corpo.dados));
    }

    if (acao === 'recuperarSenhaPorEmail') {
      return responderJSON(recuperarSenhaPorEmail(corpo.email));
    }

    if (acao === 'inserir') {
      const objeto = inserirLinha(corpo.sheet, corpo.dados);
      registrarHistoricoSeInformado(corpo);
      return responderJSON({ ok: true, objeto: objeto });
    }

    if (acao === 'atualizar') {
      const ok = atualizarLinha(corpo.sheet, corpo.id, corpo.dados);
      registrarHistoricoSeInformado(corpo);
      return responderJSON({ ok: ok });
    }

    if (acao === 'atualizarPorFiltro') {
      const ok = atualizarLinhaPorFiltro(corpo.sheet, corpo.filtros, corpo.dados);
      return responderJSON({ ok: ok });
    }

    if (acao === 'excluir') {
      const ok = excluirLinha(corpo.sheet, corpo.id);
      registrarHistoricoSeInformado(corpo);
      return responderJSON({ ok: ok });
    }

    if (acao === 'excluirEmCascata') {
      // Usado, por ex., para excluir um repasse e tudo que depende dele
      excluirLinhasFiltradas(corpo.sheet, corpo.campoFiltro, corpo.valorFiltro);
      return responderJSON({ ok: true });
    }

    if (acao === 'uploadArquivo') {
      const resultado = salvarArquivoNoDrive(corpo.base64, corpo.nomeArquivo, corpo.mimeType, corpo.conselhoId);
      return responderJSON({ ok: true, url: resultado });
    }

    if (acao === 'getDb') {
      return responderJSON(montarBancoCompleto());
    }

    return responderJSON({ erro: 'Ação POST não reconhecida: ' + acao });
  } catch (erro) {
    return responderJSON({ erro: 'Erro no servidor: ' + erro.message });
  }
}

function responderJSON(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// LOGIN E SENHA
// ============================================================================

function gerarHashSenha(senha) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha + SENHA_SALT);
  return bytes.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function fazerLogin(login, senha) {
  const usuarios = lerLinhas('usuarios');
  const usuario = usuarios.filter(function (u) {
    return String(u.login).toUpperCase() === String(login).toUpperCase();
  })[0];

  if (!usuario) return { erro: 'Login ou senha incorretos.' };
  if (usuario.status === 'pendente') return { erro: 'Seu cadastro ainda está aguardando aprovação do Administrador.' };
  if (usuario.status !== 'ativo') return { erro: 'Seu acesso está inativo. Procure o Administrador.' };
  if (gerarHashSenha(senha) !== usuario.senhaHash) return { erro: 'Login ou senha incorretos.' };

  // NUNCA devolvemos a senha/hash para o site — só os dados necessários
  return {
    usuario: {
      id: Number(usuario.id),
      nomeCompleto: usuario.nomeCompleto,
      cargo: usuario.cargo,
      telefone: usuario.telefone,
      email: usuario.email,
      nivelAcesso: usuario.nivelAcesso,
      conselhoId: usuario.conselhoId ? Number(usuario.conselhoId) : null,
      login: usuario.login,
      status: usuario.status,
    },
  };
}

function gerarLoginAPartirDoNome(nomeCompleto) {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  const semAcento = function (s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };
  const primeiro = semAcento(partes[0]).toUpperCase().replace(/[^A-Z]/g, '');
  const ultimo = semAcento(partes[partes.length - 1]).toUpperCase().replace(/[^A-Z]/g, '');
  return partes.length > 1 ? primeiro + '.' + ultimo : primeiro;
}

function gerarSenhaAleatoria() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const l1 = letras.charAt(Math.floor(Math.random() * letras.length));
  const l2 = letras.charAt(Math.floor(Math.random() * letras.length)).toLowerCase();
  const l3 = letras.charAt(Math.floor(Math.random() * letras.length)).toLowerCase();
  const numeros = Math.floor(1000 + Math.random() * 9000);
  return l1 + l2 + l3 + '@' + numeros;
}

// Usado pela tela "Solicitar cadastro" do site
function registrarSolicitacaoCadastro(dados) {
  const login = gerarLoginAPartirDoNome(dados.nomeCompleto);
  const senha = gerarSenhaAleatoria();
  const objeto = {
    nomeCompleto: dados.nomeCompleto,
    cpf: dados.cpf,
    telefone: dados.telefone,
    cargo: dados.cargo,
    email: dados.email,
    nivelAcesso: dados.nivelAcesso,
    conselhoId: '', // o Administrador define isso na aprovação
    login: login,
    senhaHash: gerarHashSenha(senha),
    status: 'pendente',
  };
  inserirLinha('usuarios', objeto);
  // Em uma versão futura: enviar "login" e "senha" por e-mail para o
  // solicitante usando MailApp.sendEmail(...) — hoje o Administrador
  // precisa comunicar isso manualmente ao aprovar.
  return { ok: true, login: login };
}

// Usado pelo Administrador Geral para cadastrar um usuário diretamente (já ativo)
function criarUsuarioAdmin(dados) {
  const login = gerarLoginAPartirDoNome(dados.nomeCompleto);
  const senha = gerarSenhaAleatoria();
  const objeto = {
    nomeCompleto: dados.nomeCompleto,
    cpf: dados.cpf,
    telefone: dados.telefone,
    cargo: dados.cargo,
    email: dados.email,
    nivelAcesso: dados.nivelAcesso,
    conselhoId: dados.conselhoId || '',
    login: login,
    senhaHash: gerarHashSenha(senha),
    status: 'ativo',
  };
  inserirLinha('usuarios', objeto);
  // A senha em texto puro só existe neste retorno — o Administrador precisa
  // anotar/comunicar agora, pois depois só é possível redefinir, não ver de novo.
  return { ok: true, login: login, senha: senha };
}

// Usado pelo Administrador Geral para gerar uma nova senha para alguém
function redefinirSenhaAdmin(usuarioId) {
  const senha = gerarSenhaAleatoria();
  const ok = atualizarLinha('usuarios', usuarioId, { senhaHash: gerarHashSenha(senha) });
  return { ok: ok, senha: senha };
}

// Usado pela tela "Meu perfil" (o próprio usuário editando seus dados/senha)
function atualizarPerfilUsuario(usuarioId, dados) {
  const campos = { telefone: dados.telefone, email: dados.email };
  if (dados.novaSenha) campos.senhaHash = gerarHashSenha(dados.novaSenha);
  const ok = atualizarLinha('usuarios', usuarioId, campos);
  return { ok: ok };
}

// Usado pelo "Esqueci minha senha" na tela de login: se o e-mail bater com um
// usuário ativo, gera uma senha nova e manda por e-mail. Por segurança, o
// retorno é sempre { ok: true } mesmo se o e-mail não existir no sistema —
// assim quem está tentando adivinhar e-mails cadastrados não descobre nada.
function recuperarSenhaPorEmail(email) {
  const usuarios = lerLinhas('usuarios');
  const usuario = usuarios.filter(function (u) {
    return String(u.email).toLowerCase() === String(email).toLowerCase();
  })[0];

  if (!usuario || usuario.status !== 'ativo') {
    return { ok: true };
  }

  const novaSenha = gerarSenhaAleatoria();
  atualizarLinha('usuarios', usuario.id, { senhaHash: gerarHashSenha(novaSenha) });

  try {
    MailApp.sendEmail({
      to: usuario.email,
      subject: 'Sistema PAF - Recuperação de senha',
      body: 'Olá, ' + usuario.nomeCompleto + '!\n\n' +
        'Sua senha de acesso ao Sistema PAF foi redefinida.\n\n' +
        'Login: ' + usuario.login + '\n' +
        'Nova senha: ' + novaSenha + '\n\n' +
        'Recomendamos trocar essa senha assim que entrar, em "Meu perfil".\n\n' +
        'Se você não pediu essa redefinição, procure o Administrador do sistema.',
    });
  } catch (e) {
    // Se o envio de e-mail falhar (ex.: cota diária do Gmail esgotada), a
    // senha já foi trocada mesmo assim. Fica registrado no log de execução.
    Logger.log('Falha ao enviar e-mail de recuperação: ' + e.message);
  }

  return { ok: true };
}

// ============================================================================
// LEITURA E ESCRITA GENÉRICA NAS PLANILHAS
// ============================================================================

function abrirAba(nomeChave) {
  const idPlanilha = SHEETS[nomeChave];
  if (!idPlanilha) throw new Error('Planilha não configurada: ' + nomeChave);
  return SpreadsheetApp.openById(idPlanilha).getSheets()[0];
}

function lerLinhas(nomeChave) {
  const aba = abrirAba(nomeChave);
  const valores = aba.getDataRange().getValues();
  if (valores.length === 0) return [];
  const cabecalho = valores[0];
  const linhas = [];
  for (let i = 1; i < valores.length; i++) {
    if (valores[i].every(function (v) { return v === ''; })) continue; // pula linha em branco
    const linha = {};
    cabecalho.forEach(function (col, idx) { linha[col] = valores[i][idx]; });
    linhas.push(linha);
  }
  return linhas;
}

function proximoId(nomeChave) {
  const linhas = lerLinhas(nomeChave);
  let maior = 0;
  linhas.forEach(function (l) {
    if (Number(l.id) > maior) maior = Number(l.id);
  });
  return maior + 1;
}

function inserirLinha(nomeChave, objeto) {
  const aba = abrirAba(nomeChave);
  const cabecalho = aba.getDataRange().getValues()[0];
  if (!objeto.id) objeto.id = proximoId(nomeChave);
  const linha = cabecalho.map(function (col) {
    return objeto[col] !== undefined && objeto[col] !== null ? objeto[col] : '';
  });
  aba.appendRow(linha);
  return objeto;
}

function atualizarLinha(nomeChave, id, camposNovos) {
  const aba = abrirAba(nomeChave);
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  const colId = cabecalho.indexOf('id');
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][colId]) === String(id)) {
      cabecalho.forEach(function (col, idx) {
        if (camposNovos[col] !== undefined) {
          aba.getRange(i + 1, idx + 1).setValue(camposNovos[col]);
        }
      });
      return true;
    }
  }
  return false;
}

function excluirLinha(nomeChave, id) {
  const aba = abrirAba(nomeChave);
  const dados = aba.getDataRange().getValues();
  const colId = dados[0].indexOf('id');
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][colId]) === String(id)) {
      aba.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// Atualiza a primeira linha cujas colunas batem com "filtros" (ex: {repasseId: 101, categoriaId: 11}).
// Usado para tabelas sem um "id" próprio manuseado pelo site, como PlanoItens.
function atualizarLinhaPorFiltro(nomeChave, filtros, camposNovos) {
  const aba = abrirAba(nomeChave);
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  const chavesFiltro = Object.keys(filtros);
  const colunasFiltro = chavesFiltro.map(function (k) { return cabecalho.indexOf(k); });
  for (let i = 1; i < dados.length; i++) {
    const bate = colunasFiltro.every(function (colIdx, j) {
      return String(dados[i][colIdx]) === String(filtros[chavesFiltro[j]]);
    });
    if (bate) {
      cabecalho.forEach(function (col, idx) {
        if (camposNovos[col] !== undefined) {
          aba.getRange(i + 1, idx + 1).setValue(camposNovos[col]);
        }
      });
      return true;
    }
  }
  return false;
}

// Exclui todas as linhas de uma planilha em que uma coluna bate com um valor
// (ex: apagar todos os lançamentos de um repasse excluído)
function excluirLinhasFiltradas(nomeChave, campoFiltro, valorFiltro) {
  const aba = abrirAba(nomeChave);
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  const colFiltro = cabecalho.indexOf(campoFiltro);
  if (colFiltro === -1) return;
  // de baixo para cima, para não bagunçar os índices ao apagar
  for (let i = dados.length - 1; i >= 1; i--) {
    if (String(dados[i][colFiltro]) === String(valorFiltro)) {
      aba.deleteRow(i + 1);
    }
  }
}

function registrarHistoricoSeInformado(corpo) {
  if (!corpo.historico) return;
  const h = corpo.historico;
  inserirLinha('historicoGeral', {
    dataHora: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
    perfil: h.perfil || '',
    usuario: h.usuario || '',
    conselhoId: h.conselhoId || '',
    conselhoNome: h.conselhoNome || '',
    acao: h.acao || '',
  });
}

// ============================================================================
// ARQUIVOS (PDF) NO GOOGLE DRIVE
// ============================================================================

function salvarArquivoNoDrive(base64, nomeArquivo, mimeType, conselhoNome) {
  const pastaRaiz = DriveApp.getFolderById(PASTA_ARQUIVOS_RAIZ);
  let pastaConselho = null;
  const pastasExistentes = pastaRaiz.getFoldersByName(conselhoNome);
  if (pastasExistentes.hasNext()) {
    pastaConselho = pastasExistentes.next();
  } else {
    pastaConselho = pastaRaiz.createFolder(conselhoNome);
  }
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, nomeArquivo);
  const arquivo = pastaConselho.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return arquivo.getUrl();
}

// ============================================================================
// MONTAGEM DO "BANCO" COMPLETO — devolve tudo no mesmo formato que o
// protótipo em React já espera (para o site precisar de poucos ajustes)
// ============================================================================

function formatarDataISO(valor) {
  if (!valor && valor !== 0) return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(valor);
}

function paraNumeroOuNulo(valor) {
  return valor === '' || valor === null || valor === undefined ? null : Number(valor);
}

function montarBancoCompleto() {
  const conselhos = lerLinhas('conselhos').map(function (c) {
    return {
      id: Number(c.id),
      nomeConselho: c.nomeConselho,
      escolas: String(c.escolas).split(';').map(function (s) { return s.trim(); }),
      cnpj: c.cnpj,
      presidente: c.presidente,
      tesoureiro: c.tesoureiro || null,
      vencimento: formatarDataISO(c.vencimento),
    };
  });

  const categoriasTodas = lerLinhas('categorias').map(function (c) {
    return { id: Number(c.id), conselhoId: Number(c.conselhoId), nome: c.nome, tipo: c.tipo, subtipo: c.subtipo || null };
  });
  const categoriasPorConselho = {};
  categoriasTodas.forEach(function (c) {
    if (!categoriasPorConselho[c.conselhoId]) categoriasPorConselho[c.conselhoId] = [];
    categoriasPorConselho[c.conselhoId].push(c);
  });

  const planoItensTodos = lerLinhas('planoItens');
  const arquivosPlanoTodos = lerLinhas('arquivosPlano');
  const repasses = lerLinhas('repasses').map(function (r) {
    return {
      id: Number(r.id),
      conselhoId: Number(r.conselhoId),
      descricao: r.descricao,
      data: formatarDataISO(r.data),
      custeio: Number(r.custeio) || 0,
      capital: Number(r.capital) || 0,
      saldoAnterior: Number(r.saldoAnterior) || 0,
      valoresDefinidos: String(r.valoresDefinidos).toUpperCase() === 'TRUE',
    };
  });

  const planos = repasses.map(function (r) {
    return {
      id: r.id,
      repasseId: r.id,
      itens: planoItensTodos.filter(function (i) { return Number(i.repasseId) === r.id; }).map(function (i) {
        return { categoriaId: Number(i.categoriaId), valorPrevisto: Number(i.valorPrevisto) || 0 };
      }),
      arquivos: arquivosPlanoTodos.filter(function (a) { return Number(a.repasseId) === r.id; }).map(function (a) {
        return { id: Number(a.id), nome: a.nome, url: a.url, status: a.status };
      }),
    };
  });

  const itensLancTodos = lerLinhas('lancamentoItens');
  const arquivosNFTodos = lerLinhas('arquivosNF');
  const orcamentosTodos = lerLinhas('lancamentoOrcamentos');
  const lancamentos = lerLinhas('lancamentos').map(function (l) {
    return {
      id: Number(l.id),
      conselhoId: Number(l.conselhoId),
      repasseId: Number(l.repasseId),
      categoriaId: Number(l.categoriaId),
      data: formatarDataISO(l.data),
      fornecedor: l.fornecedor || '',
      numeroNF: l.numeroNF || '',
      valor: Number(l.valor) || 0,
      descricao: l.descricao || '',
      lancadoPor: l.lancadoPor || '',
      status: l.status,
      itens: itensLancTodos.filter(function (i) { return Number(i.lancamentoId) === Number(l.id); }).map(function (i) {
        return { descricao: i.descricao, quantidade: Number(i.quantidade) || 0, valorUnitario: Number(i.valorUnitario) || 0 };
      }),
      arquivosNF: arquivosNFTodos.filter(function (a) { return Number(a.lancamentoId) === Number(l.id); }).map(function (a) {
        return { id: Number(a.id), nome: a.nome, url: a.url };
      }),
      orcamentos: orcamentosTodos.filter(function (a) { return Number(a.lancamentoId) === Number(l.id); }).map(function (a) {
        return { id: Number(a.id), nome: a.nome, url: a.url };
      }),
      historico: [],
    };
  });

  const remanejamentos = lerLinhas('remanejamentos').map(function (r) {
    return {
      id: Number(r.id),
      conselhoId: Number(r.conselhoId),
      repasseId: Number(r.repasseId),
      origemId: Number(r.origemId),
      destinoId: Number(r.destinoId),
      valor: Number(r.valor) || 0,
      justificativa: r.justificativa,
      status: r.status,
    };
  });

  const historicoGeral = lerLinhas('historicoGeral').map(function (h) {
    return {
      id: Number(h.id),
      dataHora: h.dataHora,
      perfil: h.perfil,
      usuario: h.usuario,
      conselhoId: paraNumeroOuNulo(h.conselhoId),
      conselhoNome: h.conselhoNome || null,
      acao: h.acao,
    };
  });

  // NUNCA incluir senhaHash no que volta para o site
  const usuarios = lerLinhas('usuarios').map(function (u) {
    return {
      id: Number(u.id),
      nomeCompleto: u.nomeCompleto,
      cpf: u.cpf,
      telefone: u.telefone,
      cargo: u.cargo,
      email: u.email,
      nivelAcesso: u.nivelAcesso,
      conselhoId: paraNumeroOuNulo(u.conselhoId),
      login: u.login,
      status: u.status,
    };
  });

  const snapshotTodos = lerLinhas('prestacaoSnapshot');
  const prestacoesContas = lerLinhas('prestacoesContas').map(function (p) {
    return {
      id: Number(p.id),
      conselhoId: Number(p.conselhoId),
      ano: Number(p.ano),
      periodo: p.periodo,
      status: p.status,
      dataEnvio: formatarDataISO(p.dataEnvio),
      enviadoPor: p.enviadoPor,
      observacaoCoordenador: p.observacaoCoordenador || null,
      lancamentosSnapshot: snapshotTodos.filter(function (s) { return Number(s.prestacaoId) === Number(p.id); }).map(function (s) {
        return {
          categoria: s.categoria, tipo: s.tipo, data: formatarDataISO(s.data),
          fornecedor: s.fornecedor, numeroNF: s.numeroNF, valor: Number(s.valor) || 0, status: s.status,
        };
      }),
    };
  });

  const alocacoesTodas = lerLinhas('rendimentoAlocacoes');
  const rendimentos = lerLinhas('rendimentos').map(function (r) {
    return {
      id: Number(r.id),
      conselhoId: Number(r.conselhoId),
      repasseId: Number(r.repasseId),
      valorInformado: Number(r.valorInformado) || 0,
      valor: Number(r.valor) || 0,
      extratoNome: r.extratoNome || '',
      extratoUrl: r.extratoUrl || '',
      status: r.status,
      dataEnvio: formatarDataISO(r.dataEnvio),
      enviadoPor: r.enviadoPor,
      observacaoCoordenador: r.observacaoCoordenador || null,
      alocacoes: alocacoesTodas.filter(function (a) { return Number(a.rendimentoId) === Number(r.id); }).map(function (a) {
        return { categoriaId: Number(a.categoriaId), valor: Number(a.valor) || 0 };
      }),
    };
  });

  return {
    conselhos: conselhos,
    categoriasPorConselho: categoriasPorConselho,
    repasses: repasses,
    planos: planos,
    lancamentos: lancamentos,
    remanejamentos: remanejamentos,
    historicoGeral: historicoGeral,
    usuarios: usuarios,
    prestacoesContas: prestacoesContas,
    rendimentos: rendimentos,
  };
}

// ============================================================================
// FUNÇÃO DE TESTE — rode esta função manualmente no editor do Apps Script
// (botão "Executar") para conferir se está tudo funcionando antes de
// implantar. Veja o resultado em "Ver" > "Registros de execução".
// ============================================================================
function testarConexao() {
  const banco = montarBancoCompleto();
  Logger.log('Conselhos encontrados: ' + banco.conselhos.length);
  Logger.log('Repasses encontrados: ' + banco.repasses.length);
  Logger.log('Usuários encontrados: ' + banco.usuarios.length);
  Logger.log(JSON.stringify(banco.conselhos, null, 2));
}
