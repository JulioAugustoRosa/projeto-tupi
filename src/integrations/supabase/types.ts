export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      alunos: {
        Row: {
          created_at: string
          data_nascimento: string | null
          documentos: string | null
          foto_url: string | null
          id: string
          idade: number | null
          nome: string
          professor_id: string
          responsaveis: string | null
          serie: string | null
          turma_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_nascimento?: string | null
          documentos?: string | null
          foto_url?: string | null
          id?: string
          idade?: number | null
          nome: string
          professor_id: string
          responsaveis?: string | null
          serie?: string | null
          turma_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_nascimento?: string | null
          documentos?: string | null
          foto_url?: string | null
          id?: string
          idade?: number | null
          nome?: string
          professor_id?: string
          responsaveis?: string | null
          serie?: string | null
          turma_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alunos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades: {
        Row: {
          arquivo_tipo: string | null
          arquivo_url: string | null
          conteudo_extraido: string | null
          created_at: string
          data_atividade: string | null
          descricao: string | null
          disciplina: string | null
          id: string
          professor_id: string
          status: string
          tema: string | null
          titulo: string
          turma_id: string | null
          updated_at: string
        }
        Insert: {
          arquivo_tipo?: string | null
          arquivo_url?: string | null
          conteudo_extraido?: string | null
          created_at?: string
          data_atividade?: string | null
          descricao?: string | null
          disciplina?: string | null
          id?: string
          professor_id: string
          status?: string
          tema?: string | null
          titulo: string
          turma_id?: string | null
          updated_at?: string
        }
        Update: {
          arquivo_tipo?: string | null
          arquivo_url?: string | null
          conteudo_extraido?: string | null
          created_at?: string
          data_atividade?: string | null
          descricao?: string | null
          disciplina?: string | null
          id?: string
          professor_id?: string
          status?: string
          tema?: string | null
          titulo?: string
          turma_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades_adaptadas: {
        Row: {
          aluno_id: string | null
          arquivo_url: string | null
          atividade_id: string
          conteudo_adaptado: string
          created_at: string
          id: string
          nivel_dificuldade: string | null
          observacoes: string | null
          status: string
          tipo_adaptacao: string
        }
        Insert: {
          aluno_id?: string | null
          arquivo_url?: string | null
          atividade_id: string
          conteudo_adaptado?: string
          created_at?: string
          id?: string
          nivel_dificuldade?: string | null
          observacoes?: string | null
          status?: string
          tipo_adaptacao?: string
        }
        Update: {
          aluno_id?: string | null
          arquivo_url?: string | null
          atividade_id?: string
          conteudo_adaptado?: string
          created_at?: string
          id?: string
          nivel_dificuldade?: string | null
          observacoes?: string | null
          status?: string
          tipo_adaptacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_adaptadas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_adaptadas_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          professor_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          professor_id: string
          titulo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          professor_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      necessidades_educacionais: {
        Row: {
          aluno_id: string
          condicao: string
          created_at: string
          detalhes: string | null
          id: string
          nivel_suporte: string | null
        }
        Insert: {
          aluno_id: string
          condicao: string
          created_at?: string
          detalhes?: string | null
          id?: string
          nivel_suporte?: string | null
        }
        Update: {
          aluno_id?: string
          condicao?: string
          created_at?: string
          detalhes?: string | null
          id?: string
          nivel_suporte?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "necessidades_educacionais_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
        ]
      }
      observacoes: {
        Row: {
          aluno_id: string | null
          atividade_id: string | null
          conteudo: string
          created_at: string
          id: string
          professor_id: string
          tipo: string | null
          turma_id: string | null
        }
        Insert: {
          aluno_id?: string | null
          atividade_id?: string | null
          conteudo: string
          created_at?: string
          id?: string
          professor_id: string
          tipo?: string | null
          turma_id?: string | null
        }
        Update: {
          aluno_id?: string | null
          atividade_id?: string | null
          conteudo?: string
          created_at?: string
          id?: string
          professor_id?: string
          tipo?: string | null
          turma_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_pedagogico: {
        Row: {
          aluno_id: string
          comportamento: string | null
          dificuldades: string | null
          dificuldades_especificas: string | null
          estrategias_funcionam: string | null
          facilidades: string | null
          hiperfocos: string | null
          id: string
          interesses_pessoais: string | null
          nivel_aprendizagem: string | null
          observacoes_pedagogicas: string | null
          preferencias_aprendizagem: string | null
          updated_at: string
        }
        Insert: {
          aluno_id: string
          comportamento?: string | null
          dificuldades?: string | null
          dificuldades_especificas?: string | null
          estrategias_funcionam?: string | null
          facilidades?: string | null
          hiperfocos?: string | null
          id?: string
          interesses_pessoais?: string | null
          nivel_aprendizagem?: string | null
          observacoes_pedagogicas?: string | null
          preferencias_aprendizagem?: string | null
          updated_at?: string
        }
        Update: {
          aluno_id?: string
          comportamento?: string | null
          dificuldades?: string | null
          dificuldades_especificas?: string | null
          estrategias_funcionam?: string | null
          facilidades?: string | null
          hiperfocos?: string | null
          id?: string
          interesses_pessoais?: string | null
          nivel_aprendizagem?: string | null
          observacoes_pedagogicas?: string | null
          preferencias_aprendizagem?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_pedagogico_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          escola: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          escola?: string | null
          id: string
          nome?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          escola?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      relatorios: {
        Row: {
          aluno_id: string | null
          conteudo: string | null
          created_at: string
          id: string
          periodo_fim: string | null
          periodo_inicio: string | null
          professor_id: string
          tipo: string
          titulo: string
          turma_id: string | null
        }
        Insert: {
          aluno_id?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          professor_id: string
          tipo?: string
          titulo: string
          turma_id?: string | null
        }
        Update: {
          aluno_id?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          professor_id?: string
          tipo?: string
          titulo?: string
          turma_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relatorios_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relatorios_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turmas: {
        Row: {
          ano_letivo: number
          created_at: string
          descricao: string | null
          id: string
          nome: string
          professor_id: string
          serie: string
          turno: string
          updated_at: string
        }
        Insert: {
          ano_letivo?: number
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          professor_id: string
          serie?: string
          turno?: string
          updated_at?: string
        }
        Update: {
          ano_letivo?: number
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          professor_id?: string
          serie?: string
          turno?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
